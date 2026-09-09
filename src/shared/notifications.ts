export type NotificationTarget =
  | { kind: 'activity'; activityId: string; path?: string }
  | { kind: 'desktop'; resourceId?: string; activityId?: string };

export interface NotificationInput {
  source: string;
  title: string;
  body: string;
  severity?: 'info' | 'success' | 'warning' | 'error';
  target?: NotificationTarget;
  /** Page that already displays this event, even when its link opens a chat. */
  page?: string;
  /** Stable event key within a source. Repeated delivery does not alert again. */
  key?: string;
  native?: boolean;
}

export interface AppNotification extends NotificationInput {
  id: string;
  createdAt: string;
  readAt?: string;
  dismissedAt?: string;
}

export type NotificationCommand =
  | { action: 'read' | 'dismiss' | 'open'; id: string }
  | { action: 'readAll' }
  | { action: 'readTarget'; target: NotificationTarget }
  | { action: 'view'; view?: NotificationView }
  | { action: 'readVisible' };

export interface NotificationView {
  page: string;
  target?: NotificationTarget;
}

/** Viewing a source acknowledges its alerts, without dismissing the underlying work. */
export function matchesNotificationTarget(
  item: NotificationTarget | undefined,
  target: NotificationTarget,
): boolean {
  if (target.kind === 'activity')
    return !!target.activityId && item?.activityId === target.activityId;
  return (
    target.kind === 'desktop' &&
    !!target.resourceId &&
    item?.kind === 'desktop' &&
    item.resourceId === target.resourceId
  );
}

export type Notify = (input: NotificationInput) => Promise<AppNotification>;
