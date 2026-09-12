import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { TeachEvidenceStep } from '../shared/teach-dex';
import { CuaAdapter, type ComputerLease, type ComputerResult } from './desktop/cua-adapter';

export type CapturedStep = Omit<TeachEvidenceStep, 'id' | 'at'>;
export interface TeachingCapture {
  start(record: (step: CapturedStep) => void): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): Promise<void>;
}

const sensitivePattern =
  /password|passcode|pin|secret|security code|one[- ]time|verification code|cvv|card number/i;
const text = (value: unknown, limit = 500) =>
  typeof value === 'string'
    ? value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').slice(0, limit)
    : undefined;

export function sanitizeTeachElement(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const item = value as Record<string, unknown>;
  const role = text(item.role ?? item.subrole ?? item.type);
  const label = text(item.label ?? item.name ?? item.title ?? item.description);
  const sensitive = sensitivePattern.test(
    `${role ?? ''} ${label ?? ''} ${text(item.input_type) ?? ''}`,
  );
  const rawValue = text(item.value ?? item.text, 2000);
  return {
    index: Number.isSafeInteger(item.element_index) ? Number(item.element_index) : undefined,
    parent: Number.isSafeInteger(item.parent_index) ? Number(item.parent_index) : undefined,
    role,
    label,
    value: sensitive && rawValue ? '[REDACTED]' : rawValue,
    focused: item.focused === true || item.is_focused === true || item.AXFocused === true,
    sensitive,
  };
}

interface Observation {
  application: string;
  window: string;
  elements: ReturnType<typeof sanitizeTeachElement>[];
  screenshot?: string;
}

function structure(
  elements: NonNullable<Observation['elements']>,
  current: NonNullable<ReturnType<typeof sanitizeTeachElement>>,
) {
  const byIndex = new Map(
    elements.flatMap((item) => (item?.index === undefined ? [] : [[item.index, item] as const])),
  );
  const result: string[] = [];
  let item = current;
  for (let depth = 0; depth < 4 && item?.parent !== undefined; depth++) {
    const parent = byIndex.get(item.parent);
    if (!parent) break;
    const description = [parent.role, parent.label].filter(Boolean).join(' · ');
    if (description) result.unshift(description);
    item = parent;
  }
  return result;
}

export function inferTeachStep(
  previous: Observation | undefined,
  current: Observation,
): CapturedStep | undefined {
  const elements = current.elements.filter(Boolean) as NonNullable<
    ReturnType<typeof sanitizeTeachElement>
  >[];
  const focused =
    elements.find((item) => item.focused) ??
    elements.find((item) => item.label && /field|button|link|cell/i.test(item.role ?? ''));
  const beforeElements = (previous?.elements.filter(Boolean) ?? []) as NonNullable<
    ReturnType<typeof sanitizeTeachElement>
  >[];
  const beforeFocused = beforeElements.find((item) => item.focused);
  const base = {
    application: current.application,
    window: current.window,
    role: focused?.role,
    label: focused?.label,
    value: focused?.value,
    structure: focused ? structure(elements, focused) : [],
    screenshot: elements.some((item) => item.sensitive) ? undefined : current.screenshot,
    redacted: elements.some((item) => item.sensitive),
  };
  if (
    !previous ||
    previous.application !== current.application ||
    previous.window !== current.window
  )
    return { ...base, kind: 'app_change' };
  if (
    focused &&
    beforeFocused &&
    focused.index === beforeFocused.index &&
    focused.value !== beforeFocused.value
  )
    return { ...base, kind: 'keyboard' };
  if (focused && focused.index !== beforeFocused?.index) return { ...base, kind: 'click' };
  const signature = (items: typeof elements) =>
    createHash('sha256')
      .update(
        JSON.stringify(items.map(({ value: _value, sensitive: _sensitive, ...item }) => item)),
      )
      .digest('hex');
  if (signature(elements) !== signature(beforeElements)) return { ...base, kind: 'scroll' };
}

/** Polls the frontmost native window and derives semantic actions from AX state changes. */
export class CuaTeachingCapture implements TeachingCapture {
  private adapter = new CuaAdapter();
  private lease?: ComputerLease;
  private record?: (step: CapturedStep) => void;
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = true;
  private paused = false;
  private previous?: Observation;
  private abort = new AbortController();

  async start(record: (step: CapturedStep) => void) {
    const permissions = await this.adapter.permissions(true);
    if (!permissions.accessibility || !permissions.screenRecording)
      throw new Error('Teach Dex needs Accessibility and Screen Recording permissions.');
    this.record = record;
    this.stopped = false;
    this.paused = false;
    this.abort = new AbortController();
    this.lease = await this.adapter.lease(`teach-${randomUUID()}`);
    await this.poll();
  }
  pause() {
    this.paused = true;
  }
  resume() {
    this.paused = false;
    void this.poll();
  }
  private async poll() {
    clearTimeout(this.timer);
    if (this.stopped || this.paused || !this.lease) return;
    try {
      const window = (await this.adapter.windows(this.abort.signal))[0];
      if (window) {
        const result = await this.lease.call(
          'get_window_state',
          {
            pid: window.pid,
            window_id: window.windowId,
            max_elements: 300,
            max_depth: 18,
            max_dimension: 1280,
          },
          this.abort.signal,
        );
        const current = this.observation(window.application, window.title, result);
        const step = inferTeachStep(this.previous, current);
        this.previous = current;
        if (step) this.record?.(step);
      }
    } catch (error) {
      if (!this.abort.signal.aborted)
        this.record?.({
          kind: 'app_change',
          label: 'Capture needs attention',
          value: error instanceof Error ? error.message : String(error),
          redacted: true,
        });
    }
    if (!this.stopped && !this.paused) {
      this.timer = setTimeout(() => void this.poll(), 750);
      this.timer.unref();
    }
  }
  private observation(application: string, window: string, result: ComputerResult): Observation {
    const elements = Array.isArray(result.data.elements)
      ? result.data.elements.map(sanitizeTeachElement)
      : [];
    const image = result.images[0];
    return {
      application,
      window,
      elements,
      screenshot: image ? `data:${image.mimeType};base64,${image.dataBase64}` : undefined,
    };
  }
  async stop() {
    if (this.stopped) return;
    this.stopped = true;
    clearTimeout(this.timer);
    this.abort.abort();
    this.lease?.close();
    this.lease = undefined;
    await this.adapter.dispose();
  }
}

/** External OS capture fixture used by the Electron acceptance suite. */
export class FixtureTeachingCapture implements TeachingCapture {
  private steps: CapturedStep[] = [];
  private record?: (step: CapturedStep) => void;
  private timer?: ReturnType<typeof setInterval>;
  private paused = false;
  constructor(private path: string) {}
  async start(record: (step: CapturedStep) => void) {
    this.record = record;
    this.steps = JSON.parse(await readFile(this.path, 'utf8'));
    this.timer = setInterval(() => {
      if (!this.paused) {
        const step = this.steps.shift();
        if (step) this.record?.(step);
      }
    }, 80);
  }
  pause() {
    this.paused = true;
  }
  resume() {
    this.paused = false;
  }
  async stop() {
    clearInterval(this.timer);
  }
}
