/** Platform-independent desktop alarm contract. Dates are UTC ISO strings. */
export interface DesktopAlarm {
  id: string;
  kind: 'timer' | 'reminder';
  title: string;
  message: string;
  state: 'running' | 'paused' | 'ringing' | 'dismissed' | 'cancelled';
  createdAt: string;
  dueAt: string | null;
  remainingMs: number;
  sourceActivityId?: string;
  requestId?: string;
  occurrence: number;
  alertedOccurrence?: number;
  firedAt?: string;
  overdue?: boolean;
  notificationError?: string;
}
export interface DesktopAlarmSnapshot {
  alarms: DesktopAlarm[];
  availability: string;
}
export type DesktopTimeFilesRequest =
  | { operation: 'alarms.list' }
  | {
      operation: 'timer.start';
      title: string;
      durationSeconds: number;
      message?: string;
      sourceActivityId?: string;
      requestId?: string;
    }
  | {
      operation: 'reminder.create';
      title: string;
      message: string;
      dueAt: string;
      sourceActivityId?: string;
      requestId?: string;
    }
  | { operation: 'timer.pause' | 'timer.resume' | 'timer.cancel' | 'reminder.dismiss'; id: string }
  | { operation: 'reminder.snooze'; id: string; durationSeconds: number }
  | { operation: 'file.open'; fileId: string; activityId: string };
