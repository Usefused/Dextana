import type { UserBrowserCommand } from '../../shared/user-browser';
interface Pending {
  command: UserBrowserCommand;
  activityId: string;
  delivered: boolean;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}
/** Separate tab lanes allow parallel work without racing focus or replaying delivered input. */
export class BrowserRequests {
  private pending = new Map<string, Pending>();
  assertAvailable(tabId: string) {
    if ([...this.pending.values()].some((item) => item.command.tabId === tabId))
      throw new Error('This browser tab is already working. Wait for its action to finish.');
    if (this.pending.size >= 12) throw new Error('Wait for a browser action to finish.');
  }
  newTabCount() {
    return [...this.pending.values()].filter((item) => item.command.action === 'new_tab').length;
  }
  add(command: UserBrowserCommand, signal: AbortSignal, activityId: string) {
    signal.throwIfAborted();
    const aborted = () =>
      this.cancel(
        command.requestId,
        'Browser work was cancelled. Inspect any delivered input before trying again.',
      );
    signal.addEventListener('abort', aborted, { once: true });
    const timer = setTimeout(
      () =>
        this.cancel(
          command.requestId,
          'A browser action timed out. Its outcome is uncertain; inspect before retrying.',
        ),
      30_000,
    );
    return new Promise<unknown>((resolve, reject) =>
      this.pending.set(command.requestId, {
        command,
        activityId,
        resolve,
        reject,
        delivered: false,
      }),
    ).finally(() => {
      clearTimeout(timer);
      signal.removeEventListener('abort', aborted);
    });
  }
  next() {
    const entry = [...this.pending.values()].find((item) => !item.delivered);
    if (!entry) return {};
    entry.delivered = true;
    return { command: entry.command };
  }
  active(requestId: string) {
    const entry = this.pending.get(requestId);
    return { requestId: entry?.delivered ? requestId : null };
  }
  take(requestId: unknown) {
    const entry = this.pending.get(String(requestId));
    if (!entry?.delivered) throw new Error('No matching browser request.');
    this.pending.delete(entry.command.requestId);
    return entry;
  }
  closeTabs(ids: string[]) {
    for (const entry of this.pending.values()) {
      if (!ids.includes(entry.command.tabId) || entry.command.action === 'close_tab') continue;
      this.pending.delete(entry.command.requestId);
      entry.reject(
        new Error('The target tab closed or disconnected. Choose another attached tab explicitly.'),
      );
    }
  }
  private cancel(id: string, message: string) {
    const entry = this.pending.get(id);
    this.pending.delete(id);
    entry?.reject(new Error(message));
  }
  release(activityId: string) {
    for (const [id, entry] of this.pending)
      if (entry.activityId === activityId)
        this.cancel(id, 'Browser task ended. Inspect any delivered input before retrying.');
  }
  stop(message: string) {
    for (const entry of this.pending.values()) entry.reject(new Error(message));
    this.pending.clear();
  }
}
