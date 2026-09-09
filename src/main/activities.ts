import { realpath } from 'node:fs/promises';
import { basename, dirname, join, isAbsolute, extname } from 'node:path';
import { documentExtensions } from './files';
import { rememberFile, rememberURL, rememberDesktop } from './context';
import type { Activity, DesktopAPI } from '../shared/types';
import { Store, localActivity } from './store';
import { Runtime } from './runtime';
import type { Browsers } from './browser';
import type { Fused } from './fused';
import type { MCPConnections } from './mcp';
import type { WorkFiles } from './files';
import type { DesktopGateway } from './desktop/gateway';
import { LocalCapabilities, ActionDenied } from './local-capabilities';

type LocalRequest = { id: string; activityId: string; kind: string; payload: any };
type BackendState = { revision: number; activities: Activity[]; requests: LocalRequest[]; result?: any };

/** UI commands and the local-capability boundary; the backend owns execution. */
export class Activities {
  private local: LocalCapabilities;
  private ready?: Promise<void>;
  private stopped = false;
  private revision = -1;
  private localVersion = '';
  private pending = new Map<string, { controller: AbortController; activityId: string; events: number }>();
  constructor(private store: Store, private runtime: Runtime, private publish: () => void, browsers: Browsers, fused: Fused, mcp?: MCPConnections, files?: WorkFiles, desktop?: DesktopGateway, private onActivities?: (activities: Activity[]) => void) {
    this.local = new LocalCapabilities(store, publish, browsers, fused, mcp, files, activity => this.receipt(activity), desktop);
  }
  private async request(path: string, data?: unknown) {
    const response = await this.runtime.request('/dextana/activity' + path, { ...(data === undefined ? {} : { method: 'POST', body: JSON.stringify(data) }), signal: AbortSignal.timeout(30_000) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'The agent backend could not process this request.');
    return body;
  }
  initialize() {
    this.ready ??= (async () => {
      await this.runtime.ensure();
      const data = await this.request('/command', { action: 'initialize', settings: this.store.state.settings, activities: this.store.state.activities, local: this.store.state.activities.map(localActivity) });
      this.apply(data);
      this.store.backendOwnsActivities = true;
      await this.store.save();
      void this.poll();
    })();
    return this.ready;
  }
  private apply(data: BackendState) {
    if (data.revision < this.revision) return;
    this.revision = data.revision;
    const requests = new Set(data.requests.map(request => request.id));
    for (const [id, pending] of this.pending) if (!requests.has(id)) { pending.controller.abort(); this.pending.delete(id); }
    const old = new Map(this.store.state.activities.map(activity => [activity.id, activity]));
    this.store.state.activities = data.activities.map(incoming => {
      const activity = old.get(incoming.id);
      if (!activity) return incoming;
      const local = localActivity(activity);
      const events = activity.events;
      const approval = activity.approval;
      // Preserve object identity for a local action waiting on approval.
      for (const key of Object.keys(activity)) delete (activity as any)[key];
      Object.assign(activity, incoming, local);
      for (const item of incoming.context ?? []) {
        if (item.kind === 'file') rememberFile(activity, item.location, item.status as any);
        else if (item.kind === 'desktop' && item.desktop) rememberDesktop(activity, item.name, item.desktop);
        else rememberURL(activity, item.location, item.status as any);
      }
      if ([...this.pending.values()].some(value => value.activityId === activity.id)) activity.events = events;
      if (approval) activity.approval = approval;
      if (!['starting', 'running'].includes(activity.status)) this.local.release(activity.id);
      return activity;
    });
    const localVersion = JSON.stringify(this.store.state.activities.map(localActivity));
    if (this.store.backendOwnsActivities && localVersion !== this.localVersion) {
      this.localVersion = localVersion;
      void this.store.save().catch(() => { this.localVersion = ''; });
    }
    this.onActivities?.(this.store.state.activities);
    this.publish();
    for (const request of data.requests) if (!this.pending.has(request.id)) {
      const activity = this.store.state.activities.find(a => a.id === request.activityId);
      if (!activity) continue;
      const controller = new AbortController();
      this.pending.set(request.id, { controller, activityId: activity.id, events: activity.events.length });
      void this.execute(request, activity, controller.signal);
    }
  }
  private async poll() {
    let failures = 0;
    while (!this.stopped) {
      try { this.apply(await this.request('/events?revision=' + this.revision)); failures = 0; }
      catch (error) {
        if (this.stopped) break;
        // A transient busy response must not cancel a live local approval.
        // A later authoritative snapshot retires requests that have ended.
        if (++failures >= 3) for (const activity of this.store.state.activities) if (['starting', 'running'].includes(activity.status)) activity.error = 'The agent backend connection was lost. Restart Dextana to reconnect.';
        this.publish();
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  private async receipt(activity: Activity) {
    const current = [...this.pending.entries()].find(([, p]) => p.activityId === activity.id);
    if (!current) throw new Error('This local request is no longer pending.');
    current[1].controller.signal.throwIfAborted();
    const events = activity.events.slice(current[1].events);
    await this.store.save();
    await this.request('/receipt', { requestId: current[0], activityId: activity.id, events, local: [localActivity(activity)] });
    current[1].events += events.length;
  }
  private async execute(request: LocalRequest, activity: Activity, signal: AbortSignal) {
    let result: any;
    try {
      let output: unknown;
      if (request.kind === 'tool') output = await this.local.execute(activity, request.payload, signal);
      else if (request.kind === 'plan-scope') output = await this.local.preparePlan(request.payload);
      else if (request.kind === 'approval') output = await this.local.decideRuntimeApproval(activity, request.payload, signal);
      else if (request.kind === 'grant') output = this.local.grant(activity, request.payload);
      else throw new Error('Unsupported local capability request.');
      signal.throwIfAborted();
      await this.receipt(activity);
      result = { output: output ?? null };
    } catch (error) {
      if (!signal.aborted) await this.receipt(activity).catch(() => {});
      result = { error: (error as Error).message, denied: error instanceof ActionDenied };
    }
    try { if (!signal.aborted) await this.request('/result/' + encodeURIComponent(request.id), { activityId: activity.id, ...result }); }
    catch { /* A cancelled or completed request cannot be replayed. */ }
    // Keep the consumed ID until the next backend snapshot removes it.
  }
  private async command(action: string, input?: unknown) {
    await this.initialize();
    const state = await this.request('/command', { action, input, settings: this.store.state.settings, local: this.store.state.activities.map(localActivity) });
    this.apply(state);
    return state.result;
  }
  async start(input: Parameters<DesktopAPI['start']>[0]) {
    if (!input || typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 32_000) throw new Error('Enter a task up to 32,000 characters.');
    if (input.files !== undefined && (!Array.isArray(input.files) || input.files.length > 20 || input.files.some(path => typeof path !== 'string' || path.length > 4096 || /[\x00-\x1f]/.test(path) || !isAbsolute(path) || !documentExtensions.includes(extname(path).slice(1).toLowerCase())))) throw new Error('Attach up to 20 supported work documents.');
    if (input.files) input = { ...input, files: await Promise.all(input.files.map(async path => join(await realpath(dirname(path)), basename(path)))) };
    const destination = this.store.state.folders?.find(folder => folder.id === input.folderId);
    if (input.folderId !== undefined && !destination) throw new Error('Workspace folder no longer exists. Choose another folder.');
    if (destination) destination.collapsed = false;
    return this.command('start', input) as Promise<string>;
  }
  cancel(activityId: string) {
    const affected = new Set([activityId]);
    for (let pass = 0; pass < 3; pass++) for (const activity of this.store.state.activities)
      if (activity.parentId && affected.has(activity.parentId)) affected.add(activity.id);
    for (const pending of this.pending.values()) if (affected.has(pending.activityId)) pending.controller.abort();
    return this.command('cancel', { activityId });
  }
  selectModel(activityId: string, model: string, reasoning: string) { return this.command('model', { activityId, model, reasoning }); }
  syncSettings() { return this.command('initialize'); }
  answerQuestions(input: Parameters<DesktopAPI['answerQuestions']>[0]) {
    return this.command('answer_questions', input) as Promise<void>;
  }
  resume(activityId: string) { return this.command('resume', { activityId }); }
  steer(activityId: string, messageId: string) { return this.command('steer', { activityId, messageId }); }
  updateQueuedMessage(input: Parameters<DesktopAPI['updateQueuedMessage']>[0]) {
    return this.command('update_queued_message', input) as Promise<void>;
  }
  editMessage(input: Parameters<DesktopAPI['editMessage']>[0]) {
    if (!input || typeof input.activityId !== 'string' || typeof input.messageId !== 'string' || typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 32_000) throw new Error('Enter a message up to 32,000 characters.');
    return this.command('edit_message', { activityId: input.activityId, messageId: input.messageId, prompt: input.prompt }) as Promise<string>;
  }
  decidePlan(input: Parameters<DesktopAPI['decidePlan']>[0]) { return this.command('plan', input); }
  attachContext(id: string, paths: string[]) { return this.local.attachContext(id, paths); }
  archive(id: string, archived: boolean) { return this.local.archive(id, archived); }
  setSessionApprovals(id: string, allowAll: boolean) { return this.local.setSessionApprovals(id, allowAll); }
  setBrowserPreferences(input: Parameters<DesktopAPI['setBrowserPreferences']>[0]) { return this.local.setBrowserPreferences(input); }
  setPermission(input: Parameters<DesktopAPI['setPermission']>[0]) { return this.local.setPermission(input); }
  approve(input: Parameters<DesktopAPI['approve']>[0]) { return this.local.approve(input); }
  stopAll() { this.stopped = true; for (const pending of this.pending.values()) pending.controller.abort(); }
}
