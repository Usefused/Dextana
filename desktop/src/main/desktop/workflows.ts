import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, readdir, lstat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  desktopWorkflowDescriptors,
  type DesktopWatchRule,
  type DesktopRenamePreview,
  type DesktopProcessingJob,
  type DesktopWorkflowSnapshot,
} from '../../shared/desktop-workflows';
import {
  desktopFile,
  discoverLocalProcessors,
  fileIdentity,
  processLocally,
  validateProcessing,
  type LocalProcessors,
} from './workflows-processors';

import {
  type WorkflowState,
  parseWorkflowState,
  recoverWorkflowState,
  workflowText as text,
  createWatchRule,
  matchesWatch,
  createRenameEntry,
  pendingRenameEntries,
  validateRenameEntry,
  renameEntryExclusive,
} from './workflows-state';

export { desktopWorkflowDescriptors };
export interface DesktopWorkflowContext {
  activityId: string;
}
export interface DesktopWorkflowHost {
  openPath(path: string): Promise<void>;
  openURL(url: string): Promise<void>;
  notify(input: {
    title: string;
    body: string;
    activityId: string;
    path?: string;
    severity?: 'success' | 'error';
  }): Promise<void> | void;
  runWatch(
    input: { ruleId: string; activityId: string; prompt: string; paths: string[] },
    signal: AbortSignal,
  ): Promise<void>;
  onChange?(): void;
}
interface Prepared {
  action: string;
  args: Record<string, unknown>;
  preview: string;
}
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
function url(value: unknown) {
  const parsed = new URL(text(value, 'a web address', 4096));
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password)
    throw new Error('Use an HTTP or HTTPS address without embedded credentials.');
  return parsed.href;
}
function publicWatch({ seen: _seen, ...rule }: DesktopWatchRule) {
  return rule;
}

export class DesktopWorkflows {
  private state: WorkflowState = {
    version: 1,
    watches: [],
    renames: [],
    jobs: [],
    pauseOnBattery: true,
  };
  private processors: LocalProcessors = { index: true };
  private onBattery = false;
  private stopped = false;
  private poll?: ReturnType<typeof setInterval>;
  private scanBusy = false;
  private observations = new Map<string, Record<string, string>>();
  private watchRuns = new Map<string, AbortController>();
  private jobRun?: {
    id: string;
    controller: AbortController;
    reason?: 'battery' | 'shutdown' | 'cancel';
  };
  private background = new Set<Promise<unknown>>();
  private saving: Promise<void> = Promise.resolve();
  private mutations: Promise<unknown> = Promise.resolve();
  private statePath: string;
  constructor(
    private directory: string,
    private host: DesktopWorkflowHost,
  ) {
    this.statePath = join(directory, 'desktop-workflows.json');
  }
  async initialize() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    try {
      this.state = parseWorkflowState(await readFile(this.statePath, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await recoverWorkflowState(this.state);
    this.processors = await discoverLocalProcessors();
    await this.save();
    this.poll = setInterval(
      () =>
        void this.tick().catch((error) => {
          for (const rule of this.state.watches.filter((rule) => rule.enabled)) {
            rule.status = 'error';
            rule.error = errorMessage(error);
          }
          this.publish();
        }),
      3000,
    );
    this.poll.unref();
    this.launch(this.tick());
  }
  async dispose() {
    this.stopped = true;
    if (this.poll) clearInterval(this.poll);
    for (const controller of this.watchRuns.values()) controller.abort();
    if (this.jobRun) {
      if (this.jobRun.reason !== 'cancel') this.jobRun.reason = 'shutdown';
      this.jobRun.controller.abort();
    }
    // An already-started UI mutation may still enqueue its final save. Drain it before
    // background work and disk writes, while rejecting work that has not started yet.
    await this.mutations.catch(() => {});
    await Promise.allSettled([...this.background]);
    await this.saving;
  }
  private launch(operation: Promise<unknown>) {
    this.background.add(operation);
    void operation.catch(() => {}).finally(() => this.background.delete(operation));
  }
  operations() {
    return desktopWorkflowDescriptors.map((item) => {
      if (item.name !== 'processing.start') return item;
      const clone = structuredClone(item);
      clone.inputSchema.properties.kind = {
        type: 'string',
        enum: Object.keys(this.processors).filter((kind) =>
          Boolean(this.processors[kind as keyof LocalProcessors]),
        ),
      };
      return clone;
    });
  }
  async capabilities() {
    // Status refreshes report support only; the gateway is the sole source of scoped operation schemas.
    this.processors = await discoverLocalProcessors();
    return {
      processors: {
        index: true,
        ocr: !!this.processors.ocr,
        transcribe: !!this.processors.transcribe,
        convert: !!this.processors.convert,
      },
      onBattery: this.onBattery,
      pauseOnBattery: this.state.pauseOnBattery,
      limitations: [
        'Folder watching and processing require Dextana to be running; folder changes are reconciled after restart.',
        'Watched folders are nonrecursive. Changes produced during their own workflow become the new baseline to prevent loops.',
        'Active processing is cancelled and restarted from the beginning when paused on battery.',
        'Native processors run locally and are available only when installed; transcription also requires a local model.',
      ],
    };
  }
  snapshot(activityId?: string): DesktopWorkflowSnapshot {
    const belongs = (item: { activityId: string }) => !activityId || item.activityId === activityId;
    return structuredClone({
      watches: this.state.watches.filter(belongs),
      renames: this.state.renames.filter(belongs),
      jobs: this.state.jobs.filter(belongs),
      onBattery: this.onBattery,
      pauseOnBattery: this.state.pauseOnBattery,
    });
  }
  setOnBattery(value: boolean) {
    this.onBattery = value;
    if (this.paused() && this.jobRun && !this.jobRun.reason) {
      this.jobRun.reason = 'battery';
      this.jobRun.controller.abort();
    }
    this.publish();
    if (!value) this.launch(this.tick());
  }
  private paused() {
    return this.onBattery && this.state.pauseOnBattery;
  }
  private publish() {
    try {
      this.host.onChange?.();
    } catch {
      // Observers are outside the durable transaction. A later snapshot can catch up;
      // a rendering failure must never roll back state that is already on disk.
    }
  }
  private save() {
    const json = JSON.stringify(this.state, null, 2);
    const operation = this.saving
      .catch(() => {})
      .then(async () => {
        const temporary = `${this.statePath}.${randomUUID()}.tmp`;
        await writeFile(temporary, json, { flag: 'wx', mode: 0o600 });
        await rename(temporary, this.statePath);
        this.publish();
      });
    this.saving = operation;
    return operation;
  }
  private owned<T extends { id: string; activityId: string }>(
    items: T[],
    id: unknown,
    context: DesktopWorkflowContext,
  ): T {
    const item = items.find((item) => item.id === id && item.activityId === context.activityId);
    if (!item)
      throw new Error('This desktop item does not belong to the current chat or no longer exists.');
    return item;
  }
  async prepare(
    action: string,
    args: Record<string, unknown>,
    context: DesktopWorkflowContext,
  ): Promise<Prepared> {
    if (!context.activityId) throw new Error('A desktop workflow requires its originating chat.');
    if (!desktopWorkflowDescriptors.some((item) => item.name === action))
      throw new Error('Unknown desktop workflow operation.');
    let details: unknown = args;
    if (action === 'workflow.rename_apply' || action === 'workflow.rename_undo') {
      const preview = this.owned(this.state.renames, args.id, context);
      details = {
        id: preview.id,
        entries: preview.entries.map((entry) => ({
          from: action.endsWith('undo') ? entry.to : entry.from,
          to: action.endsWith('undo') ? entry.from : entry.to,
          completed: entry.moved,
        })),
        status: preview.status,
      };
    }
    return { action, args: structuredClone(args), preview: JSON.stringify(details, null, 2) };
  }
  private assertRunning() {
    if (this.stopped) throw new Error('Desktop workflows are shutting down.');
  }
  async execute(
    action: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
    context: DesktopWorkflowContext,
  ): Promise<unknown> {
    this.assertRunning();
    signal.throwIfAborted();
    await this.prepare(action, args, context);
    this.assertRunning();
    const operation = this.mutations
      .catch(() => {})
      .then(async () => {
        this.assertRunning();
        signal.throwIfAborted();
        return this.perform(action, args, signal, context);
      });
    this.mutations = operation;
    return operation;
  }
  private async perform(
    action: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
    context: DesktopWorkflowContext,
  ): Promise<unknown> {
    // One broker surface delegates to cohesive handlers; adding a workflow does not add a model tool.
    const handlers: Record<string, () => Promise<unknown> | unknown> = {
      'workflow.watch_list': () => this.snapshot(context.activityId).watches.map(publicWatch),
      'workflow.rename_list': () => this.snapshot(context.activityId).renames,
      'processing.list': () => this.snapshot(context.activityId).jobs,
      'device.status': () => this.capabilities(),
      'processing.capabilities': () => this.capabilities(),
      'workflow.rename_preview': () => this.previewRename(args, signal, context),
      'workflow.rename_apply': () =>
        this.renameBatch(this.owned(this.state.renames, args.id, context), false, signal),
      'workflow.rename_undo': () =>
        this.renameBatch(this.owned(this.state.renames, args.id, context), true, signal),
      'workflow.watch_save': () => this.saveWatch(args, signal, context),
      'workflow.watch_set_enabled': () => this.setWatchEnabled(args, context),
      'workflow.watch_remove': () => this.removeWatch(args, context),
      'workflow.watch_run': () => this.retryWatch(args, context),
      'workflow.setup_open': () => this.openSetup(args, signal),
      'workflow.handoff': () => this.handoff(args, signal),
      'workflow.notify': () => this.notify(args, signal, context),
      'processing.start': () => this.startProcessing(args, signal, context),
      'processing.cancel': () => this.cancelProcessing(args, context),
      'device.power_policy': () => this.setPowerPolicy(args),
    };
    const handler = handlers[action];
    if (!handler) throw new Error('Unknown desktop workflow operation.');
    return handler();
  }
  private async saveWatch(
    args: Record<string, unknown>,
    signal: AbortSignal,
    context: DesktopWorkflowContext,
  ): Promise<unknown> {
    if (this.state.watches.length >= 100 && !args.id)
      throw new Error('This workspace already has 100 watched folders.');
    const previous = args.id ? this.owned(this.state.watches, args.id, context) : undefined;
    if (previous && this.watchRuns.has(previous.id))
      throw new Error('Wait for this folder workflow to finish before changing its rule.');
    const rule = await createWatchRule(args, context.activityId, previous?.id);
    rule.seen = await this.scan(rule);
    signal.throwIfAborted();
    const previousWatches = this.state.watches;
    this.state.watches = [...this.state.watches.filter((item) => item.id !== rule.id), rule];
    try {
      await this.save();
    } catch (error) {
      this.state.watches = previousWatches;
      throw error;
    }
    this.observations.delete(rule.id);
    return {
      ...rule,
      seen: undefined,
      note: 'Existing files are the baseline. Only subsequent stable changes will trigger work.',
    };
  }
  private async setWatchEnabled(
    args: Record<string, unknown>,
    context: DesktopWorkflowContext,
  ): Promise<unknown> {
    const rule = this.owned(this.state.watches, args.id, context);
    if (typeof args.enabled !== 'boolean') throw new Error('enabled must be a boolean.');
    const previous = { enabled: rule.enabled, status: rule.status, error: rule.error };
    rule.enabled = args.enabled;
    if (rule.status !== 'running') {
      rule.status = rule.enabled ? 'watching' : 'paused';
      if (rule.enabled) delete rule.error;
    }
    try {
      await this.save();
    } catch (error) {
      Object.assign(rule, previous);
      throw error;
    }
    if (rule.enabled) this.launch(this.tick());
    return { ...rule, seen: undefined };
  }
  private async removeWatch(
    args: Record<string, unknown>,
    context: DesktopWorkflowContext,
  ): Promise<unknown> {
    const rule = this.owned(this.state.watches, args.id, context);
    const previous = this.state.watches;
    this.state.watches = this.state.watches.filter((item) => item.id !== rule.id);
    try {
      await this.save();
    } catch (error) {
      this.state.watches = previous;
      throw error;
    }
    this.watchRuns.get(rule.id)?.abort();
    this.observations.delete(rule.id);
    return { removed: rule.id };
  }
  private async retryWatch(
    args: Record<string, unknown>,
    context: DesktopWorkflowContext,
  ): Promise<unknown> {
    const rule = this.owned(this.state.watches, args.id, context);
    if (!rule.pending.length) throw new Error('There are no pending files to retry.');
    if (this.watchRuns.has(rule.id)) throw new Error('This folder workflow is already running.');
    const previous = { error: rule.error, enabled: rule.enabled, status: rule.status };
    rule.error = undefined;
    rule.enabled = true;
    rule.status = 'watching';
    try {
      await this.save();
    } catch (error) {
      Object.assign(rule, previous);
      throw error;
    }
    this.launch(this.dispatch(rule));
    return { queued: rule.id, pausedOnBattery: this.paused() };
  }
  private async prepareSetupTarget(value: unknown): Promise<{ path?: string; url?: string }> {
    if (!value || typeof value !== 'object')
      throw new Error('Each target needs exactly one path or url.');
    const item = value as Record<string, unknown>;
    if (!!item.path === !!item.url) throw new Error('Each target needs exactly one path or url.');
    if (item.url) return { url: url(item.url) };
    const info = await lstat(text(item.path, 'a local path', 4096));
    return { path: await desktopFile(item.path, info.isDirectory()) };
  }
  private async openSetupTarget(value: unknown, index: number, signal: AbortSignal) {
    signal.throwIfAborted();
    try {
      const target = await this.prepareSetupTarget(value);
      signal.throwIfAborted();
      if (target.path) await this.host.openPath(target.path);
      else await this.host.openURL(target.url!);
      return { target: index + 1, ...target, opened: true };
    } catch (error) {
      // A missing app/file affects this item only; explicit cancellation still stops the whole setup.
      signal.throwIfAborted();
      return { target: index + 1, opened: false, error: errorMessage(error) };
    }
  }
  private async openSetup(args: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
    if (!Array.isArray(args.targets) || !args.targets.length || args.targets.length > 12)
      throw new Error('Open 1–12 files, folders or web pages.');
    const results = [];
    for (const [index, target] of args.targets.entries())
      results.push(await this.openSetupTarget(target, index, signal));
    return { results };
  }
  private async handoff(args: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
    const path = await desktopFile(args.path);
    signal.throwIfAborted();
    await this.host.openPath(path);
    return { opened: path, application: 'system default' };
  }
  private async notify(
    args: Record<string, unknown>,
    signal: AbortSignal,
    context: DesktopWorkflowContext,
  ): Promise<unknown> {
    const title = text(args.title, 'a notification title', 120);
    const body = text(args.body, 'notification text', 1000);
    const path = args.path === undefined ? undefined : await desktopFile(args.path);
    signal.throwIfAborted();
    await this.host.notify({
      title,
      body,
      activityId: context.activityId,
      ...(path ? { path } : {}),
    });
    return {
      notificationRequested: true,
      status: 'submitted',
      activityId: context.activityId,
      ...(path ? { path } : {}),
    };
  }
  private async startProcessing(
    args: Record<string, unknown>,
    signal: AbortSignal,
    context: DesktopWorkflowContext,
  ): Promise<unknown> {
    if (
      this.state.jobs.filter((job) => ['queued', 'running', 'paused'].includes(job.status))
        .length >= 50
    )
      throw new Error('Finish or cancel queued processing before adding more jobs.');
    this.processors = await discoverLocalProcessors();
    const options = await validateProcessing(args, this.processors);
    if (
      this.state.jobs.some(
        (job) =>
          job.outputPath === options.outputPath &&
          ['queued', 'running', 'paused'].includes(job.status),
      )
    )
      throw new Error('Another job is already producing this output.');
    signal.throwIfAborted();
    const job: DesktopProcessingJob = {
      id: randomUUID(),
      activityId: context.activityId,
      ...options,
      status: this.paused() ? 'paused' : 'queued',
      createdAt: new Date().toISOString(),
    };
    this.state.jobs.push(job);
    try {
      await this.save();
    } catch (error) {
      this.state.jobs = this.state.jobs.filter((item) => item !== job);
      throw error;
    }
    this.launch(this.runNextJob());
    return structuredClone(job);
  }
  private async cancelProcessing(
    args: Record<string, unknown>,
    context: DesktopWorkflowContext,
  ): Promise<unknown> {
    const job = this.owned(this.state.jobs, args.id, context);
    if (['completed', 'failed', 'cancelled'].includes(job.status))
      throw new Error('This processing job has already finished.');
    const previous = { status: job.status, finishedAt: job.finishedAt };
    job.status = 'cancelled';
    job.finishedAt = new Date().toISOString();
    try {
      await this.save();
    } catch (error) {
      if (job.status === 'cancelled') Object.assign(job, previous);
      throw error;
    }
    if (this.jobRun?.id === job.id) {
      this.jobRun.reason = 'cancel';
      this.jobRun.controller.abort();
    }
    return { ...structuredClone(job), cancellationRequested: true };
  }
  private async setPowerPolicy(args: Record<string, unknown>): Promise<unknown> {
    if (typeof args.pauseOnBattery !== 'boolean')
      throw new Error('pauseOnBattery must be a boolean.');
    const previous = this.state.pauseOnBattery;
    this.state.pauseOnBattery = args.pauseOnBattery;
    try {
      await this.save();
    } catch (error) {
      this.state.pauseOnBattery = previous;
      throw error;
    }
    this.setOnBattery(this.onBattery);
    this.launch(this.tick());
    return { pauseOnBattery: this.state.pauseOnBattery, onBattery: this.onBattery };
  }
  private async previewRename(
    args: Record<string, unknown>,
    signal: AbortSignal,
    context: DesktopWorkflowContext,
  ) {
    if (!Array.isArray(args.entries) || !args.entries.length || args.entries.length > 100)
      throw new Error('Preview 1–100 file renames.');
    const sources = new Set<string>();
    const destinations = new Set<string>();
    const entries = [];
    for (const item of args.entries) {
      signal.throwIfAborted();
      const entry = await createRenameEntry(item);
      const { from, to } = entry;
      if (sources.has(from.toLowerCase()) || destinations.has(to.toLowerCase()))
        throw new Error('Rename sources and destinations must be unique.');
      sources.add(from.toLowerCase());
      destinations.add(to.toLowerCase());
      entries.push(entry);
    }
    const preview: DesktopRenamePreview = {
      id: randomUUID(),
      activityId: context.activityId,
      createdAt: new Date().toISOString(),
      status: 'preview',
      entries,
    };
    this.state.renames.push(preview);
    try {
      await this.save();
    } catch (error) {
      this.state.renames = this.state.renames.filter((item) => item !== preview);
      throw error;
    }
    return structuredClone(preview);
  }
  private async renameBatch(batch: DesktopRenamePreview, undo: boolean, signal: AbortSignal) {
    const entries = pendingRenameEntries(batch, undo);
    // Preflight every entry so a known conflict prevents the entire batch.
    for (const entry of entries) {
      signal.throwIfAborted();
      await validateRenameEntry(entry, undo);
    }
    batch.status = 'applying';
    batch.direction = undo ? 'undo' : 'apply';
    delete batch.error;
    await this.save();
    try {
      for (const entry of entries) {
        signal.throwIfAborted();
        await renameEntryExclusive(entry, undo);
        await this.save();
      }
      batch.status = undo ? 'undone' : 'applied';
    } catch (error) {
      batch.status = 'partial';
      batch.error = errorMessage(error);
    }
    await this.save();
    return structuredClone(batch);
  }
  private async scan(rule: DesktopWatchRule) {
    if ((await desktopFile(rule.folder, true)) !== rule.folder)
      throw new Error('The watched folder changed. Save its rule again.');
    const names = await readdir(rule.folder, { withFileTypes: true });
    if (names.length > 10000) throw new Error('A watched folder supports up to 10,000 entries.');
    const seen: Record<string, string> = {};
    for (const entry of names) {
      if (!matchesWatch(entry, rule.extensions)) continue;
      const path = join(rule.folder, entry.name);
      try {
        seen[path] = await fileIdentity(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    return seen;
  }
  private watchIsCurrent(rule: DesktopWatchRule) {
    return !this.stopped && rule.enabled && this.state.watches.includes(rule);
  }
  private canDispatch(rule: DesktopWatchRule) {
    return this.watchIsCurrent(rule) && !this.paused();
  }
  private idleWatchStatus(rule: DesktopWatchRule): DesktopWatchRule['status'] {
    return !rule.enabled || this.paused() ? 'paused' : 'watching';
  }
  private recordWatchChanges(
    rule: DesktopWatchRule,
    seen: Record<string, string>,
    previous: Record<string, string>,
  ) {
    // Require two identical observations so partially written downloads are not handed to the agent.
    const changed = Object.keys(seen).filter(
      (path) => seen[path] !== rule.seen[path] && seen[path] === previous[path],
    );
    rule.pending = [...new Set([...rule.pending.filter((path) => path in seen), ...changed])];
    for (const path of changed) rule.seen[path] = seen[path];
    for (const path of Object.keys(rule.seen)) if (!(path in seen)) delete rule.seen[path];
    return changed.length > 0;
  }
  private async observeWatch(rule: DesktopWatchRule) {
    if (!rule.enabled || rule.status === 'error' || this.watchRuns.has(rule.id)) return;
    try {
      const seen = await this.scan(rule);
      // A remove/update can complete while the filesystem read is in flight.
      if (!this.watchIsCurrent(rule)) return;
      const previous = this.observations.get(rule.id);
      this.observations.set(rule.id, seen);
      if (!previous) return;
      const changed = this.recordWatchChanges(rule, seen, previous);
      rule.status = this.idleWatchStatus(rule);
      if (changed) await this.save();
      if (rule.pending.length && !this.paused()) this.launch(this.dispatch(rule));
    } catch (error) {
      rule.status = 'error';
      rule.error = errorMessage(error);
      await this.save();
    }
  }
  async tick() {
    if (this.stopped || this.scanBusy) return;
    this.scanBusy = true;
    try {
      await this.mutations.catch(() => {});
      if (this.stopped) return;
      for (const rule of this.state.watches) await this.observeWatch(rule);
      this.launch(this.runNextJob());
    } finally {
      this.scanBusy = false;
    }
  }
  private async dispatchWatchFiles(rule: DesktopWatchRule, signal: AbortSignal) {
    signal.throwIfAborted();
    if (!this.canDispatch(rule)) return;
    const paths = rule.pending.slice(0, 100);
    await this.host.runWatch(
      { ruleId: rule.id, activityId: rule.activityId, prompt: rule.prompt, paths },
      signal,
    );
    signal.throwIfAborted();
    rule.pending = rule.pending.filter((path) => !paths.includes(path));
    rule.lastRunAt = new Date().toISOString();
    rule.status = this.idleWatchStatus(rule);
    // Outputs created by this workflow become its baseline rather than starting a feedback loop.
    rule.seen = await this.scan(rule);
    this.observations.set(rule.id, rule.seen);
  }
  private async dispatch(rule: DesktopWatchRule) {
    if (!this.canDispatch(rule) || this.watchRuns.has(rule.id) || !rule.pending.length) return;
    const controller = new AbortController();
    this.watchRuns.set(rule.id, controller);
    rule.status = 'running';
    delete rule.error;
    try {
      await this.save();
      await this.dispatchWatchFiles(rule, controller.signal);
    } catch (error) {
      rule.status = 'error';
      rule.error = errorMessage(error);
    } finally {
      this.watchRuns.delete(rule.id);
      if (rule.status === 'running') rule.status = this.idleWatchStatus(rule);
      await this.save();
    }
  }
  private async runNextJob() {
    await this.mutations.catch(() => {});
    if (this.stopped || this.jobRun) return;
    const job = this.state.jobs.find((job) => ['queued', 'paused'].includes(job.status));
    if (!job) return;
    if (this.paused()) {
      if (job.status !== 'paused') {
        job.status = 'paused';
        await this.save();
      }
      return;
    }
    const run = {
      id: job.id,
      controller: new AbortController(),
      reason: undefined as 'battery' | 'shutdown' | 'cancel' | undefined,
    };
    this.jobRun = run;
    job.status = 'running';
    delete job.error;
    try {
      await this.save();
      await processLocally(
        job,
        this.processors,
        join(this.directory, 'desktop-processing'),
        run.controller.signal,
      );
      job.status = 'completed';
      job.finishedAt = new Date().toISOString();
      await this.save();
      await Promise.resolve()
        .then(() =>
          this.host.notify({
            title: 'Local processing complete',
            body: basename(job.outputPath),
            activityId: job.activityId,
            path: job.outputPath,
          }),
        )
        .catch(() => {});
    } catch (error) {
      await this.recordProcessingFailure(job, run.reason, error);
    } finally {
      this.jobRun = undefined;
      if (!this.stopped) this.launch(this.runNextJob());
    }
  }
  private async recordProcessingFailure(
    job: DesktopProcessingJob,
    reason: 'battery' | 'shutdown' | 'cancel' | undefined,
    error: unknown,
  ) {
    // Publishing the final output is the commit point; a notification error must not undo completion.
    if (job.status === 'completed') return;
    const interrupted = { battery: 'paused', shutdown: 'queued', cancel: 'cancelled' } as const;
    job.status = reason ? interrupted[reason] : 'failed';
    if (job.status === 'failed') job.error = errorMessage(error);
    if (['failed', 'cancelled'].includes(job.status)) job.finishedAt = new Date().toISOString();
    await this.save();
    if (job.status === 'failed') {
      await Promise.resolve()
        .then(() =>
          this.host.notify({
            title: 'Local processing failed',
            body: basename(job.outputPath),
            activityId: job.activityId,
            severity: 'error',
          }),
        )
        .catch(() => {});
    }
  }
}
