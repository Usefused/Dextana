import { externalURL } from '../shared/links';
import { rememberReferences } from './context';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Snapshot } from '../shared/types';

export class Store {
  state: Snapshot = {
    settings: { ollamaUrl: 'http://127.0.0.1:11434', models: [], defaultModel: '' },
    activities: [],
    fused: { enabled: false, url: '', hasToken: false },
  };
  private writing = Promise.resolve();
  constructor(private directory: string) {}
  async load() {
    await mkdir(this.directory, { recursive: true });
    try {
      this.state = JSON.parse(await readFile(join(this.directory, 'state.json'), 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new Error(
          'Cannot read Dextana data. Restore state.json from a backup before continuing.',
        );
    }
    this.state.activities ??= [];
    this.state.mcpConnections ??= [];
    this.state.folders ??= [];
    const previousBrowser = this.state.browser;
    delete this.state.browser;
    this.state.fused ??= { enabled: false, url: '', hasToken: false };
    this.state.fusedIntegrations ??= this.state.fused.url || this.state.fused.hasToken
      ? [{ ...this.state.fused, id: 'legacy-fused', name: 'Fused', revision: 'legacy', secretId: this.state.fused.hasToken ? 'legacy' : undefined }]
      : [];
    const tabIds = new Set<string>();
    for (const activity of this.state.activities) {
      if (!activity.context) {
        activity.context = [];
        for (const message of activity.messages) if (message.content) rememberReferences(activity, message.content);
      }
      const lastVisited = activity.context?.filter(item => item.kind === 'url' && item.status === 'visited').at(-1)?.location;
      const url = externalURL(activity.browser?.url) ?? (previousBrowser?.activityId === activity.id ? externalURL(previousBrowser.url) : undefined) ?? externalURL(lastVisited);
      const tabs = (activity.browser?.tabs ?? []).flatMap(tab => {
        const page = externalURL(tab.url);
        if (!page || typeof tab.id !== 'string' || !tab.id || tabIds.has(tab.id)) return [];
        tabIds.add(tab.id);
        return [{ id: tab.id, activityId: activity.id, url: page, title: typeof tab.title === 'string' ? tab.title.slice(0, 160) : new URL(page).hostname, needsReopen: true }];
      });
      if (!activity.browserTabsInitialized && !tabs.length && url && !tabIds.has(activity.id)) {
        tabs.push({ id: activity.id, activityId: activity.id, url, title: new URL(url).hostname, needsReopen: true });
        tabIds.add(activity.id);
      }
      activity.browserTabsInitialized = true;
      const current = tabs.find(tab => tab.id === activity.browser?.activeTabId) ?? tabs[0];
      if (current) activity.browser = { url: current.url, needsReopen: true, tabs, activeTabId: current.id };
      else delete activity.browser;
      if (['starting', 'running'].includes(activity.status)) activity.status = 'interrupted';
      // A fully submitted draft is durable even if the provider's closing text
      // was interrupted. Drafting never has permission to execute work.
      if (activity.status === 'interrupted' && activity.turnMode === 'plan' && activity.plans?.at(-1)?.status === 'proposed') activity.status = 'awaiting_plan';
      for (const plan of activity.plans ?? []) if (plan.status === 'approved') plan.status = 'interrupted';
      delete activity.activePlanId;
      delete activity.planOwnerId;
      delete activity.runtimeSessionId;
      delete activity.approval;
      for (const message of activity.messages) if (message.thought) delete message.thought.runningSince;
    }
  }
  flush() { return this.writing; }
  save() {
    const { cronJobs: _serverJobs, cronError: _cronError, ...desktopState } = this.state;
    const data = JSON.stringify(desktopState, null, 2);
    const operation = this.writing
      .catch(() => {})
      .then(async () => {
        await writeFile(join(this.directory, 'state.tmp'), data, { mode: 0o600 });
        await rename(join(this.directory, 'state.tmp'), join(this.directory, 'state.json'));
      });
    this.writing = operation;
    return operation;
  }
}
