import { UserBrowserConnection } from './connection';
import type { UserBrowserPairing, UserBrowserState } from '../../shared/user-browser';

export class UserBrowser {
  private paired?: UserBrowserConnection;
  private starting?: Promise<UserBrowserPairing>;
  private usedTabs = new Map<string, Set<string>>();
  private defaults = new Map<string, string>();
  private connections = new Map<string, UserBrowserConnection>();
  constructor(
    private extensionOrigin: string,
    private changed: (states: UserBrowserState[]) => void,
  ) {}
  snapshot() {
    return [...this.connections].map(([activityId, connection]) =>
      structuredClone({
        ...connection.state,
        activityId,
        contextTabIds: [...(this.usedTabs.get(activityId) ?? [])],
      }),
    );
  }
  reuse(activityId: string) {
    if (this.connections.get(activityId)?.state.state === 'connected') return true;
    if (this.paired?.state.scope !== 'browser' || this.paired.state.state !== 'connected')
      return false;
    this.connections.set(activityId, this.paired);
    this.defaults.delete(activityId);
    this.usedTabs.delete(activityId);
    this.changed(this.snapshot());
    return true;
  }
  has(activityId: string) {
    return this.connections.has(activityId);
  }
  async begin(activityId: string, title: string) {
    if (this.paired && this.paired.state.state !== 'stopped') {
      if (this.connections.get(activityId) === this.paired && this.paired.state.state === 'waiting')
        return this.starting ?? this.paired.pairing()!;
      throw new Error(
        this.paired.state.state === 'waiting'
          ? 'Browser activation is already waiting in another chat. Complete that activation; browser-wide access can then be reused here.'
          : 'A browser connection is already active. Reuse browser-wide access, or stop the existing selected-tab connection explicitly before changing its scope.',
      );
    }
    const connection = new UserBrowserConnection(activityId, title, this.extensionOrigin, () =>
      this.changed(this.snapshot()),
    );
    this.paired = connection;
    this.connections.set(activityId, connection);
    this.usedTabs.delete(activityId);
    this.defaults.delete(activityId);
    this.starting = connection.start();
    try {
      return await this.starting;
    } catch (error) {
      connection.stop('The browser connection could not start.');
      throw error;
    } finally {
      if (this.paired === connection) this.starting = undefined;
    }
  }
  pairing(activityId: string) {
    return this.connections.get(activityId)?.pairing();
  }
  async request(activityId: string, title: string, signal: AbortSignal) {
    signal.throwIfAborted();
    const existing = this.connections.get(activityId);
    if ((!existing || existing.state.state === 'stopped') && !this.reuse(activityId)) {
      if (this.paired?.state.state === 'waiting') {
        // Join the activation, not its grant: selected-tab access belongs only
        // to the initiating chat, while browser-wide access can be reused.
        const pending = this.paired;
        await this.starting;
        await pending.requestAttachment(signal);
        if (!this.reuse(activityId))
          throw new Error(
            'The activated browser grants selected tabs to another chat. Browser-wide access is needed to share it; the existing connection remains active.',
          );
      } else await this.begin(activityId, title);
    }
    if (this.starting) await this.starting;
    const connection = this.connection(activityId);
    return connection.requestAttachment(signal);
  }
  private connection(activityId: string) {
    const connection = this.connections.get(activityId);
    if (!connection) throw new Error('This browser connection ended. Attach the tab again.');
    return connection;
  }
  prepare(activityId: string, args: Record<string, unknown>) {
    const connection = this.connection(activityId);
    // Never fall through to another chat's last-operated tab. A closed local
    // default stays explicit so the agent must choose a replacement itself.
    const tabId =
      args.tab_id ||
      this.defaults.get(activityId) ||
      connection.state.tabs.find((tab) => tab.state === 'connected')?.id;
    return connection.prepare({ ...args, ...(tabId ? { tab_id: tabId } : {}) });
  }
  execute(activityId: string, args: Record<string, unknown>, signal: AbortSignal) {
    const connection = this.connection(activityId);
    if (args._userConnection !== connection.state.id)
      throw new Error('This browser connection was replaced. Read the page again.');
    const seen = this.usedTabs.get(activityId) ?? new Set<string>();
    if (typeof args.tab_id === 'string') seen.add(args.tab_id);
    this.usedTabs.set(activityId, seen);
    return connection.execute(args, signal, activityId, seen).then((result) => {
      const value = result as Record<string, unknown>;
      if (
        !value.error &&
        args.tab_id &&
        args.action !== 'close_tab' &&
        this.connections.get(activityId) === connection
      )
        this.defaults.set(activityId, String(args.tab_id));
      return result;
    });
  }
  stop(activityId: string) {
    this.connections.get(activityId)?.stop('Stopped in Dextana.');
  }
  release(activityId: string) {
    this.connections.get(activityId)?.release(activityId);
  }
  reset(activityId: string) {
    this.release(activityId);
    this.connections.delete(activityId);
    this.defaults.delete(activityId);
    this.usedTabs.delete(activityId);
    this.changed(this.snapshot());
  }
  close() {
    for (const connection of new Set([...this.connections.values(), this.paired]))
      connection?.stop('Dextana closed.', false);
  }
}
