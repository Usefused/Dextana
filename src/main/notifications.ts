import { randomUUID } from 'node:crypto';
import { matchesNotificationTarget } from '../shared/notifications';
import type {
  AppNotification,
  NotificationCommand,
  NotificationInput,
  NotificationView,
} from '../shared/notifications';

interface NotificationHost {
  get: () => AppNotification[];
  set: (items: AppNotification[]) => void;
  save: () => Promise<void>;
  changed: () => void;
  isFocused?: () => boolean;
  showNative?: (item: AppNotification, open: () => void) => void;
  open: (item: AppNotification) => Promise<void> | void;
  failed: (error: unknown) => void;
}

/** Shared by services; persistence, UI and OS integration are injected adapters. */
export class Notifications {
  private pending: Promise<unknown> = Promise.resolve();
  private view?: NotificationView;
  constructor(private host: NotificationHost) {}

  isViewing = (item: Pick<NotificationInput, 'page' | 'target'>): boolean =>
    !!this.host.isFocused?.() &&
    !!this.view &&
    (!!(item.page && item.page === this.view.page) ||
      (!!this.view.target && matchesNotificationTarget(item.target, this.view.target)));

  refreshVisibility = () => this.command({ action: 'readVisible' });

  private serial<T>(run: () => Promise<T>): Promise<T> {
    const result = this.pending.then(run);
    this.pending = result.catch(() => {});
    return result;
  }

  private async commit(items: AppNotification[]) {
    const previous = this.host.get();
    this.host.set(items);
    try {
      await this.host.save();
    } catch (error) {
      this.host.set(previous);
      throw error;
    }
    this.host.changed();
  }

  send = (input: NotificationInput): Promise<AppNotification> =>
    this.serial(async () => {
      if (!input.source?.trim() || !input.title?.trim() || typeof input.body !== 'string')
        throw new Error('Notifications need a source, title and body.');
      const source = input.source.trim().slice(0, 80);
      const existing =
        input.key &&
        this.host.get().find((item) => item.source === source && item.key === input.key);
      if (existing) return structuredClone(existing);
      const item: AppNotification = {
        ...structuredClone(input),
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        source,
        title: input.title.slice(0, 160),
        body: input.body.slice(0, 4000),
        severity: input.severity ?? 'info',
        ...(this.isViewing(input) ? { readAt: new Date().toISOString() } : {}),
      };
      // Dismissed entries remain in the bounded history to suppress repeated events.
      await this.commit([item, ...this.host.get()].slice(0, 200));
      if (item.native !== false && !item.readAt && !this.isViewing(item)) {
        try {
          this.host.showNative?.(structuredClone(item), () => {
            void this.command({ action: 'open', id: item.id }).catch(this.host.failed);
          });
        } catch {
          /* The durable in-app notification remains available without OS alerts. */
        }
      }
      return structuredClone(item);
    });

  async command(command: NotificationCommand): Promise<void> {
    if (
      !command ||
      !['read', 'readAll', 'readTarget', 'readVisible', 'view', 'dismiss', 'open'].includes(
        command.action,
      )
    )
      throw new Error('Choose a notification action.');
    if (command.action === 'view') {
      if (command.view && (typeof command.view.page !== 'string' || !command.view.page))
        throw new Error('Choose a notification page.');
      this.view = command.view ? structuredClone(command.view) : undefined;
      return this.refreshVisibility();
    }
    if (
      command.action === 'readTarget' &&
      (!command.target || !['activity', 'desktop'].includes(command.target.kind))
    )
      throw new Error('Choose a notification source.');
    const opened = await this.serial(async () => {
      const items = this.host.get();
      const bulk =
        command.action === 'readAll' ||
        command.action === 'readTarget' ||
        command.action === 'readVisible';
      const item = bulk
        ? undefined
        : items.find((item) => item.id === command.id && !item.dismissedAt);
      if (!bulk && !item) throw new Error('This notification is no longer available.');
      const now = new Date().toISOString();
      const updated = items.map((value) => {
        const matches =
          command.action === 'readTarget'
            ? matchesNotificationTarget(value.target, command.target)
            : command.action === 'readVisible'
              ? this.isViewing(value)
              : bulk || value.id === item?.id;
        if (value.dismissedAt || !matches || (value.readAt && command.action !== 'dismiss'))
          return value;
        return {
          ...value,
          readAt: value.readAt ?? now,
          ...(command.action === 'dismiss' ? { dismissedAt: now } : {}),
        };
      });
      if (updated.some((value, index) => value !== items[index])) await this.commit(updated);
      return command.action === 'open' ? item : undefined;
    });
    if (opened) await this.host.open(structuredClone(opened));
  }

  flush() {
    return this.pending;
  }
}
