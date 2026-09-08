import type { CronJob, CronJobInput } from '../shared/types';
import type { Store } from './store';
import type { Activities } from './activities';
import type { Runtime } from './runtime';

/** Desktop dispatch adapter. Schedule evaluation and persistence belong to the server. */
export class CronJobs {
  private timer?: ReturnType<typeof setInterval>;
  private stopped = false;
  private pending: Promise<unknown> = Promise.resolve();
  constructor(private store: Store, private activities: Pick<Activities, 'start'>, private publish: () => void, private runtime: Runtime) {}
  private serial<T>(action: () => Promise<T>): Promise<T> {
    const result = this.pending.then(() => { if (this.stopped) throw new Error('Scheduler is stopping.'); return action(); });
    this.pending = result.catch(() => {});
    return result;
  }
  private async request(path = '', method = 'GET', data?: unknown) {
    await this.runtime.ensure();
    const response = await this.runtime.request('/dextana/jobs' + path, { method, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(15_000) });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(typeof body.detail === 'string' ? body.detail : 'The backend could not process this scheduled job.');
    }
    return response.json();
  }
  async initialize() {
    let polling = false;
    const poll = () => {
      if (polling || this.stopped) return;
      polling = true;
      void this.sync().catch(error => { if (!this.stopped) { this.store.state.cronError = (error as Error).message; this.publish(); } }).finally(() => { polling = false; });
    };
    this.timer = setInterval(poll, 3_000);
    this.timer.unref();
    poll();
  }
  stop() { this.stopped = true; clearInterval(this.timer); return this.pending; }
  private async refresh() {
    this.store.state.cronJobs = await this.request() as CronJob[];
    delete this.store.state.cronError;
    this.publish();
  }
  save(input: CronJobInput, id?: string) {
    return this.serial(async () => {
      if (!input || !this.store.state.settings.models.includes(input.model)) throw new Error('Choose an available model.');
      // Only send the authored input, never renderer-provided run history.
      const { name, prompt, model, expression, timezone, enabled } = input;
      const saved = await this.request(id === undefined ? '' : '/' + encodeURIComponent(id), id === undefined ? 'POST' : 'PUT', { name, prompt, model, expression, timezone, enabled });
      await this.refresh(); return saved as string;
    });
  }
  remove(id: string) { return this.serial(async () => { await this.request('/' + encodeURIComponent(id), 'DELETE'); await this.refresh(); }); }
  runNow(id: string) { return this.serial(async () => { await this.request('/' + encodeURIComponent(id) + '/run', 'POST'); await this.dispatch(); await this.refresh(); }); }
  sync() { return this.serial(async () => {
    // Reconcile desktop activity outcomes so the server can prevent overlaps.
    for (const job of this.store.state.cronJobs ?? []) for (const run of job.runs) {
      const activity = this.store.state.activities.find(a => a.id === run.activityId);
      if (activity && activity.status !== run.status) await this.request(`/${encodeURIComponent(job.id)}/runs/${encodeURIComponent(run.id)}`, 'PUT', { activityId: activity.id, status: activity.status, error: activity.error });
    }
    await this.dispatch(); await this.refresh();
  }); }
  private async dispatch() {
    const claims = await this.request('/claim', 'POST') as { jobId: string; runId: string; prompt: string; model: string }[];
    for (const claim of claims) {
      if (this.stopped) return;
      let result: { activityId?: string; status: string; error?: string };
      try {
        // The backend claim is durable before work begins. Never retry a claimed run.
        const activityId = await this.activities.start({ prompt: claim.prompt, model: claim.model });
        result = { activityId, status: 'starting' };
      } catch (error) { result = { status: 'failed', error: (error as Error).message }; }
      await this.request(`/${encodeURIComponent(claim.jobId)}/runs/${encodeURIComponent(claim.runId)}`, 'PUT', result);
    }
  }
}
