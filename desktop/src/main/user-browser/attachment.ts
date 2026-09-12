/** Chats can await one activation; cancellation belongs to the individual waiter. */
export class BrowserAttachment {
  private waiters = new Set<{ resolve: () => void; reject: (error: Error) => void }>();
  wait(signal: AbortSignal, cancel: () => void) {
    signal.throwIfAborted();
    let aborted: () => void;
    return new Promise<void>((resolve, reject) => {
      const waiter = { resolve, reject };
      this.waiters.add(waiter);
      aborted = () => {
        if (!this.waiters.delete(waiter)) return;
        reject(new Error('Browser connection request cancelled.'));
        if (!this.waiters.size) cancel();
      };
      signal.addEventListener('abort', aborted, { once: true });
    }).finally(() => signal.removeEventListener('abort', aborted));
  }
  connected() {
    for (const waiter of this.waiters) waiter.resolve();
    this.waiters.clear();
  }
  stopped(message: string) {
    for (const waiter of this.waiters) waiter.reject(new Error(message));
    this.waiters.clear();
  }
}
