import { computerKeys, scopedObservation } from './computer-observation';
import { randomUUID } from 'node:crypto';
import type {
  ComputerSelection,
  ComputerSnapshot,
  ComputerWindow,
} from '../../shared/desktop-computer';
import type { ComputerAdapter, ComputerLease, ComputerResult } from './cua-adapter';

interface Observation {
  id: string;
  at: number;
  elements: Map<number, Record<string, unknown>>;
}
function observation(result: ComputerResult): Observation {
  const { snapshot_id: id, elements } = result.data;
  if (typeof id !== 'string' || !Array.isArray(elements))
    throw new Error('This window has no usable accessibility snapshot.');
  const entries = elements.filter(
    (v): v is Record<string, unknown> => !!v && typeof v === 'object',
  );
  return {
    id,
    at: Date.now(),
    elements: new Map(entries.map((row) => [Number(row.element_index), row])),
  };
}
function actionPayload(args: Record<string, unknown>) {
  if (args.action === 'click') return { name: 'click', payload: {} };
  if (args.action === 'type' && typeof args.text === 'string' && args.text.length <= 10_000)
    return { name: 'type_text', payload: { text: args.text } };
  if (args.action === 'key' && typeof args.key === 'string' && computerKeys.includes(args.key))
    return { name: 'press_key', payload: { key: args.key } };
  throw new Error('Choose click, type with text, or key with a key name.');
}

/** One owner-selected window at a time. Stop revokes authority before any asynchronous cleanup. */
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
  private async available(signal: AbortSignal) {
    signal.throwIfAborted();
    if (!this.state.enabled)
      throw new Error('Enable computer use in Settings → Computer use first.');
    const permissions = await this.adapter.permissions(false);
    signal.throwIfAborted();
    if (!permissions.accessibility || !permissions.screenRecording) {
      this.state.enabled = false;
      this.stop();
      throw new Error('Computer use needs Accessibility and Screen Recording permissions.');
    }
  }
  async windows() {
    const signal = this.abort.signal;
    await this.available(signal);
    return this.adapter.windows(signal);
  }
  async select(id: string, activityId: string) {
    this.stop();
    const generation = this.generation;
    const window = (await this.windows()).find((candidate) => candidate.id === id);
    if (!window) throw new Error('That window closed. Refresh the window list.');
    const selection: ComputerSelection = { id: randomUUID(), activityId, window, state: 'ready' };
    const lease = await this.adapter.lease(selection.id);
    if (generation !== this.generation) {
      lease.close();
      throw new Error('Computer use was stopped.');
    }
    this.lease = lease;
    this.usedInTurn = false;
    this.state.selection = selection;
    this.touch();
    this.publish();
    return this.snapshot();
  }
  private touch() {
    clearTimeout(this.idle);
    this.idle = setTimeout(() => this.stop(), 300_000);
    this.idle.unref();
  }
  stop(activityId?: string) {
    if (activityId && this.state.selection?.activityId !== activityId) return;
    this.generation++;
    this.usedInTurn = false;
    this.abort.abort();
    this.abort = new AbortController();
    this.observed = undefined;
    clearTimeout(this.idle);
    const lease = this.lease;
    this.lease = undefined;
    if (this.state.selection) this.state.selection.state = 'stopped';
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
  private selected(activityId: string, selectionId: unknown) {
    const selected = this.state.selection;
    if (!selected || selected.activityId !== activityId || selected.id !== selectionId)
      throw new Error('Select a window for this chat in Settings → Computer use.');
    if (selected.state === 'stopped' || !this.lease)
      throw new Error('Computer use was stopped. Select the window again.');
    return selected;
  }
  status(activityId: string) {
    const selected = this.state.selection;
    return {
      enabled: this.state.enabled,
      selection: selected?.activityId === activityId ? selected : undefined,
    };
  }
  review(activityId: string, args: Record<string, unknown>) {
    const selection = this.selected(activityId, args.selectionId);
    const details = { application: selection.window.application, window: selection.window.title };
    if (!args.action) return details;
    const element = this.element(args);
    actionPayload(args);
    return {
      ...details,
      action: args.action,
      element: element.label ?? element.role,
      text: args.text,
      key: args.key,
    };
  }
  private element(args: Record<string, unknown>) {
    const snapshot = this.observed;
    if (!snapshot || snapshot.id !== args.snapshotId || Date.now() - snapshot.at > 60_000)
      throw new Error('The window snapshot expired. Inspect the window again.');
    if (!Number.isSafeInteger(args.elementIndex))
      throw new Error('Choose an integer element index.');
    const element = snapshot.elements.get(Number(args.elementIndex));
    if (!element) throw new Error('Choose an element from the latest window observation.');
    return element;
  }
  async execute(activityId: string, args: Record<string, unknown>, signal: AbortSignal) {
    if (this.busy) throw new Error('A computer action is already running.');
    const selection = this.selected(activityId, args.selectionId);
    const combined = AbortSignal.any([signal, this.abort.signal]);
    this.busy = true;
    this.usedInTurn = true;
    selection.state = 'working';
    this.publish();
    const cancelled = () => {
      if (this.state.selection === selection) this.stop(activityId);
    };
    signal.addEventListener('abort', cancelled, { once: true });
    try {
      await this.available(combined);
      const output = await this.perform(selection.window, args, combined);
      combined.throwIfAborted();
      this.touch();
      return output;
    } finally {
      signal.removeEventListener('abort', cancelled);
      this.busy = false;
      if (selection.state === 'working') selection.state = 'ready';
      this.publish();
    }
  }
  private async perform(
    window: ComputerWindow,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ) {
    const target = { pid: window.pid, window_id: window.windowId };
    if (args.action) {
      this.element(args);
      const action = actionPayload(args);
      // Consume the observation before dispatch: uncertain delivery must never replay an input.
      this.observed = undefined;
      const output = await this.lease!.call(
        action.name,
        {
          ...target,
          ...action.payload,
          element_index: args.elementIndex,
          snapshot_id: args.snapshotId,
          delivery_mode: 'background',
        },
        signal,
      );
      return {
        ...output.data,
        instruction: 'Inspect again and verify the intended effect before claiming success.',
      };
    }
    this.observed = undefined;
    const output = await this.lease!.call(
      'get_window_state',
      {
        ...target,
        max_elements: 300,
        max_depth: 18,
        max_dimension: 1280,
      },
      signal,
    );
    signal.throwIfAborted();
    const data = scopedObservation(output);
    this.observed = observation({ ...output, data });
    const first = output.images[0];
    return {
      ...data,
      selectionId: args.selectionId,
      snapshotId: this.observed.id,
      image: first
        ? { type: 'image', mediaType: first.mimeType, data: first.dataBase64 }
        : undefined,
    };
  }
  async dispose() {
    this.disable();
    await this.adapter.dispose();
  }
}
