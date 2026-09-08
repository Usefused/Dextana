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
    for (const activity of this.state.activities) {
      if (!activity.context) {
        activity.context = [];
        for (const message of activity.messages) if (message.content) rememberReferences(activity, message.content);
      }
      const lastVisited = activity.context?.filter(item => item.kind === 'url' && item.status === 'visited').at(-1)?.location;
      const url = externalURL(activity.browser?.url) ?? (previousBrowser?.activityId === activity.id ? externalURL(previousBrowser.url) : undefined) ?? externalURL(lastVisited);
      if (url) activity.browser = { url, needsReopen: true };
      else delete activity.browser;
      if (['starting', 'running'].includes(activity.status)) activity.status = 'interrupted';
      delete activity.runtimeSessionId;
      delete activity.approval;
      for (const message of activity.messages) if (message.thought) delete message.thought.runningSince;
    }
  }
  flush() { return this.writing; }
  save() {
    const data = JSON.stringify(this.state, null, 2);
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
