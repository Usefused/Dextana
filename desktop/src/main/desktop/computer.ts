import { computerKeys, windowObservation } from './computer-observation';
import { randomUUID } from 'node:crypto';
import type { ComputerActivity, ComputerSnapshot } from '../../shared/desktop-computer';
import type { ComputerAdapter, ComputerLease, ComputerResult, ComputerWindow } from './cua-adapter';
import type { ComputerCursor } from './cursor';

interface Observation {
  id: string;
  at: number;
  window: ComputerWindow;
  elements: Map<number, Record<string, unknown>>;
}

function observation(result: ComputerResult, window: ComputerWindow): Observation {
  const { snapshot_id: id, elements } = result.data;
  if (typeof id !== 'string' || !Array.isArray(elements))
    throw new Error('The application window has no usable accessibility snapshot.');
  const entries = elements.filter(
    (value): value is Record<string, unknown> => !!value && typeof value === 'object',
  );
  return {
    id,
    at: Date.now(),
    window,
    elements: new Map(entries.map((row) => [Number(row.element_index), row])),
  };
}

function targetWindow(windows: ComputerWindow[], args: Record<string, unknown>) {
  const requested = String(args.application).trim().toLocaleLowerCase();
  if (!requested) throw new Error('Name the application to inspect.');
  const title =
    typeof args.windowTitle === 'string' ? args.windowTitle.trim().toLocaleLowerCase() : '';
  let matches = windows
    .filter((window) => window.onScreen && window.onCurrentSpace && window.title.trim())
    .filter((window) => {
      const application = window.application.toLocaleLowerCase();
      return (
        application === requested ||
        application.includes(requested) ||
        requested.includes(application)
      );
    });
  if (title) {
    matches = matches.filter((window) => window.title.toLocaleLowerCase().includes(title));
  }
  matches.sort((left, right) => left.zIndex - right.zIndex);
  const match = matches[0];
  if (!match)
    throw new Error(
      `No visible ${String(args.application).trim()} window is available. Launch the app with computer.launch, then inspect it again.`,
    );
  return match;
}

function applicationName(args: Record<string, unknown>) {
  if (typeof args.application !== 'string') throw new Error('Name the application to launch.');
  const name = args.application.trim();
  if (!name || name.length > 200) throw new Error('Name the application to launch.');
  return name;
}

function launchedWindow(windows: ComputerWindow[], pid: number | undefined, application: string) {
  const exact = pid
    ? windows
        .filter((candidate) => candidate.pid === pid && candidate.onScreen)
        .sort((left, right) => left.zIndex - right.zIndex)[0]
    : undefined;
  if (exact) return exact;
  try {
    return targetWindow(windows, { application });
  } catch {
    return undefined;
  }
}

function inputDelay(signal: AbortSignal, milliseconds: number) {
  return new Promise<void>((resolve, reject) => {
    const done = () => {
      signal.removeEventListener('abort', abort);
      resolve();
    };
    const timer = setTimeout(done, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}

function actionPayload(args: Record<string, unknown>) {
  if (args.action === 'click') return { name: 'click', payload: {} };
  if (args.action === 'type' && typeof args.text === 'string' && args.text.length <= 10_000)
    return { name: 'type_text', payload: { text: args.text } };
  if (args.action === 'key' && typeof args.key === 'string' && computerKeys.includes(args.key))
    return { name: 'press_key', payload: { key: args.key } };
  throw new Error('Choose click, type with text, or key with a key name.');
}

/** Desktop scope is granted one reviewed operation at a time; no persistent window grant exists. */
export class DesktopComputer {
  private state: ComputerSnapshot = { enabled: false };
  private lease?: ComputerLease;
  private abort = new AbortController();
  private observed?: Observation;
  private busy = false;
  private usedInTurn = false;
  private generation = 0;
  private idle?: ReturnType<typeof setTimeout>;

  constructor(
    private adapter: ComputerAdapter,
    private changed: (state: ComputerSnapshot) => void,
    private cursor?: ComputerCursor,
    private guide?: () => void,
  ) {}

  snapshot() {
    return structuredClone(this.state);
  }

  private publish() {
    this.changed(this.snapshot());
  }

  async enable(prompt = false) {
    const generation = this.generation;
    const permissions = await this.adapter.permissions(prompt);
    if (generation !== this.generation) return this.snapshot();
    this.state.permissions = permissions;
    this.state.enabled = permissions.accessibility && permissions.screenRecording;
    if (!this.state.enabled) this.stop();
    this.publish();
    return this.snapshot();
  }

  async openSettings(permission: 'accessibility' | 'screenRecording') {
    await this.adapter.openSettings(permission);
    return this.enable(false);
  }

  showGuide() {
    this.guide?.();
  }

  private async available(signal: AbortSignal) {
    signal.throwIfAborted();
    const permissions = await this.adapter.permissions(false);
    signal.throwIfAborted();
    this.state.permissions = permissions;
    this.state.enabled = permissions.accessibility && permissions.screenRecording;
    this.publish();
    if (!this.state.enabled) {
      this.stop();
      this.showGuide();
      throw new Error(
        'Computer use needs Accessibility and Screen Recording permissions. Open Settings → Computer use for guided setup.',
      );
    }
  }

  private async session(activityId: string, signal: AbortSignal) {
    if (this.state.active?.activityId !== activityId && this.lease) this.stop();
    if (this.lease && this.state.active?.state !== 'stopped') return this.state.active!;
    signal.throwIfAborted();
    const generation = this.generation;
    const active: ComputerActivity = { id: randomUUID(), activityId, state: 'ready' };
    const lease = await this.adapter.lease('Dext');
    if (generation !== this.generation || signal.aborted) {
      lease.close();
      signal.throwIfAborted();
      throw new Error('Computer use was stopped.');
    }
    this.lease = lease;
    this.state.active = active;
    this.touch();
    this.publish();
    return active;
  }

  private touch() {
    clearTimeout(this.idle);
    this.idle = setTimeout(() => this.stop(), 300_000);
    this.idle.unref();
  }

  stop(activityId?: string) {
    if (activityId && this.state.active?.activityId !== activityId) return;
    this.generation++;
    this.usedInTurn = false;
    this.abort.abort();
    this.abort = new AbortController();
    this.observed = undefined;
    clearTimeout(this.idle);
    this.cursor?.hide();
    const lease = this.lease;
    this.lease = undefined;
    if (this.state.active) this.state.active.state = 'stopped';
    this.publish();
    lease?.close();
  }

  release(activityId: string) {
    if (this.usedInTurn) this.stop(activityId);
  }

  disable() {
    this.state.enabled = false;
    this.stop();
  }

  status(activityId: string) {
    const active = this.state.active;
    return {
      enabled: this.state.enabled,
      permissions: this.state.permissions,
      active: active?.activityId === activityId ? active : undefined,
      instruction: this.state.enabled
        ? 'Computer actions are available and each desktop inspection or input requires approval.'
        : 'Open Settings → Computer use to grant Accessibility and Screen Recording access.',
    };
  }

  review(_activityId: string, args: Record<string, unknown>) {
    if (!args.action)
      return {
        application: args.application,
        window: args.windowTitle || 'Frontmost visible window',
      };
    const element = this.element(args);
    const observed = this.observed!;
    actionPayload(args);
    return {
      application: observed.window.application,
      window: observed.window.title,
      action: args.action,
      element: element.label ?? element.role,
      text: args.text,
      key: args.key,
    };
  }

  private element(args: Record<string, unknown>) {
    const snapshot = this.observed;
    if (!snapshot || snapshot.id !== args.snapshotId || Date.now() - snapshot.at > 60_000)
      throw new Error('The desktop snapshot expired. Inspect the desktop again.');
    if (!Number.isSafeInteger(args.elementIndex))
      throw new Error('Choose an integer element index.');
    const element = snapshot.elements.get(Number(args.elementIndex));
    if (!element) throw new Error('Choose an element from the latest desktop observation.');
    return element;
  }

  async execute(
    activityId: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
    task: 'control' | 'launch' = 'control',
  ) {
    if (this.busy) throw new Error('A computer action is already running.');
    if (this.state.active?.activityId !== activityId && this.lease) this.stop();
    const combined = AbortSignal.any([signal, this.abort.signal]);
    this.busy = true;
    this.usedInTurn = true;
    let active: ComputerActivity | undefined;
    const cancelled = () => {
      if (this.state.active === active) this.stop(activityId);
    };
    signal.addEventListener('abort', cancelled, { once: true });
    try {
      await this.available(combined);
      active = await this.session(activityId, combined);
      active.state = 'working';
      this.publish();
      const output =
        task === 'launch'
          ? await this.performLaunch(args, combined)
          : await this.perform(args, combined);
      combined.throwIfAborted();
      this.touch();
      return output;
    } finally {
      signal.removeEventListener('abort', cancelled);
      this.busy = false;
      if (active?.state === 'working') active.state = 'ready';
      this.publish();
    }
  }

  launch(activityId: string, args: Record<string, unknown>, signal: AbortSignal) {
    return this.execute(activityId, args, signal, 'launch');
  }

  private async waitForLaunchedWindow(
    pid: number | undefined,
    application: string,
    signal: AbortSignal,
  ) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const window = launchedWindow(await this.adapter.windows(signal), pid, application);
      if (window) return window;
      if (attempt < 19) await inputDelay(signal, 250);
    }
  }

  private async performLaunch(args: Record<string, unknown>, signal: AbortSignal) {
    const requested = applicationName(args);
    this.observed = undefined;
    let output: ComputerResult;
    try {
      output = await this.lease!.call('launch_app', { name: requested }, signal);
    } catch {
      signal.throwIfAborted();
      await this.adapter.launchApplication(requested, signal);
      output = { data: { name: requested, launch_state: 'requested' }, images: [] };
    }
    const pid = Number.isSafeInteger(output.data.pid) ? Number(output.data.pid) : undefined;
    // Some apps need a moment to create their first ordinary window.
    const window = await this.waitForLaunchedWindow(pid, requested, signal);
    signal.throwIfAborted();
    if (window)
      await this.lease!.call(
        'bring_to_front',
        { pid: window.pid, window_id: window.windowId },
        signal,
      );
    return {
      launched: true,
      application:
        typeof output.data.name === 'string' && output.data.name.trim()
          ? output.data.name
          : requested,
      state: typeof output.data.launch_state === 'string' ? output.data.launch_state : 'requested',
      ...(window ? { window: window.title } : {}),
      instruction: window
        ? 'The application is open and frontmost. Inspect it before acting.'
        : 'The application started without a visible window. Inspect it when its window appears.',
    };
  }

  private async perform(args: Record<string, unknown>, signal: AbortSignal) {
    if (args.action) {
      const element = this.element(args);
      const observed = this.observed!;
      const action = actionPayload(args);
      await this.lease!.call(
        'bring_to_front',
        { pid: observed.window.pid, window_id: observed.window.windowId },
        signal,
      );
      // macOS may report the activation request as complete before the target
      // app becomes the key window. Clicking immediately can be acknowledged
      // but dropped by controls such as Calculator's keypad.
      await inputDelay(signal, 180);
      this.cursor?.move(element, String(args.action));
      // Consume the observation before dispatch: uncertain delivery must never replay an input.
      this.observed = undefined;
      const output = await this.lease!.call(
        action.name,
        {
          pid: observed.window.pid,
          window_id: observed.window.windowId,
          ...action.payload,
          element_index: args.elementIndex,
          snapshot_id: args.snapshotId,
          delivery_mode: 'foreground',
        },
        signal,
      );
      // Accessibility actions may resolve before AppKit has committed the
      // control change. Let the foreground app settle before a fresh snapshot
      // is taken or another input is dispatched.
      await inputDelay(signal, 180);
      return {
        ...output.data,
        instruction: 'Inspect again and verify the intended effect before claiming success.',
      };
    }
    this.observed = undefined;
    const window = targetWindow(await this.adapter.windows(signal), args);
    await this.lease!.call(
      'bring_to_front',
      { pid: window.pid, window_id: window.windowId },
      signal,
    );
    const output = await this.lease!.call(
      'get_window_state',
      {
        pid: window.pid,
        window_id: window.windowId,
        max_elements: 300,
        max_depth: 18,
        max_dimension: 1280,
      },
      signal,
    );
    signal.throwIfAborted();
    const data = windowObservation(output);
    this.observed = observation({ ...output, data }, window);
    const first = output.images[0];
    return {
      ...data,
      application: window.application,
      window: window.title,
      snapshotId: this.observed.id,
      image: first
        ? { type: 'image', mediaType: first.mimeType, data: first.dataBase64 }
        : undefined,
    };
  }

  async dispose() {
    this.disable();
    this.cursor?.dispose();
    await this.adapter.dispose();
  }
}
