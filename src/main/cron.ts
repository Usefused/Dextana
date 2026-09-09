import type { CronJob, CronJobInput } from '../shared/types';
import type { Store } from './store';
import type { Runtime } from './runtime';

/** Schedule settings and snapshots; the backend owns evaluation and dispatch. */
export class CronJobs {
  private timer?: ReturnType<typeof setInterval>;
  private stopped = false;
  private pending: Promise<unknown> = Promise.resolve();
  constructor(private store: Store, private publish: () => void, private runtime: Runtime, private notifyError: (message: string) => void = () => {}) {}
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
      void this.sync().catch(error => {
        if (this.stopped) return;
        const message = (error as Error).message;
        if (this.store.state.cronError !== message) this.notifyError(message);
        this.store.state.cronError = message;
        this.publish();
      }).finally(() => { polling = false; });
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
      const { name, prompt, model, expression, timezone, enabled, runAt, kind } = input;
      const saved = await this.request(id === undefined ? '' : '/' + encodeURIComponent(id), id === undefined ? 'POST' : 'PUT', { name, prompt, model, expression, timezone, enabled, runAt, kind });
      await this.refresh(); return saved as string;
    });
  }
  remove(id: string) { return this.serial(async () => { await this.request('/' + encodeURIComponent(id), 'DELETE'); await this.refresh(); }); }
  runNow(id: string) { return this.serial(async () => { await this.request('/' + encodeURIComponent(id) + '/run', 'POST'); await this.refresh(); }); }
  sync() { return this.serial(() => this.refresh()); }
}
