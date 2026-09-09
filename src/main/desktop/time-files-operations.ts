const text = { type: 'string' };
const seconds = { type: 'number', exclusiveMinimum: 0, maximum: 315360000 };
const schema = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
export const timeFileOperations = [
  {
    name: 'alarms.list',
    work: 'time',
    description:
      'List durable desktop timers and reminders, including due alarms and delivery availability.',
    inputSchema: schema({}),
    mutates: false,
  },
  {
    name: 'timer.start',
    work: 'time',
    description: 'Start a visible desktop countdown. Use only the duration the owner requested.',
    inputSchema: schema({ title: text, message: text, durationSeconds: seconds }, [
      'title',
      'durationSeconds',
    ]),
    mutates: true,
  },
  {
    name: 'timer.pause',
    work: 'time',
    description: 'Pause a running timer, retaining its remaining time.',
    inputSchema: schema({ id: text }, ['id']),
    mutates: true,
  },
  {
    name: 'timer.resume',
    work: 'time',
    description: 'Resume a paused timer.',
    inputSchema: schema({ id: text }, ['id']),
    mutates: true,
  },
  {
    name: 'timer.cancel',
    work: 'time',
    description: 'Cancel a desktop alarm by its listed ID.',
    inputSchema: schema({ id: text }, ['id']),
    mutates: true,
  },
  {
    name: 'reminder.create',
    work: 'time',
    description:
      'Save a durable one-time desktop reminder. dueAt must be a future ISO timestamp with explicit UTC offset. Alerts are delivered on next launch or wake if Dextana was not running or the device was asleep.',
    inputSchema: schema({ title: text, message: text, dueAt: text }, ['title', 'message', 'dueAt']),
    mutates: true,
  },
  {
    name: 'reminder.snooze',
    work: 'time',
    description: 'Snooze a ringing reminder or timer for the requested duration.',
    inputSchema: schema({ id: text, durationSeconds: seconds }, ['id', 'durationSeconds']),
    mutates: true,
  },
  {
    name: 'reminder.dismiss',
    work: 'time',
    description: 'Dismiss a desktop reminder or timer by its listed ID.',
    inputSchema: schema({ id: text }, ['id']),
    mutates: true,
  },
  {
    name: 'file.open',
    work: 'files',
    description:
      'Open a file reference from this chat in its default installed desktop application. No upload is performed.',
    inputSchema: schema({ fileId: text }, ['fileId']),
    mutates: true,
  },
] satisfies DesktopOperation[];
import type { DesktopOperation } from '../../shared/desktop';
