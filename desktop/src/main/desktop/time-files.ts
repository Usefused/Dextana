import { randomUUID } from 'node:crypto';
import { readFile, writeFile, rename, mkdir, lstat, realpath } from 'node:fs/promises';
import { dirname, extname, isAbsolute } from 'node:path';
import type {
  DesktopAlarm,
  DesktopAlarmSnapshot,
  DesktopTimeFilesRequest,
} from '../../shared/desktop-time-files';

export const DESKTOP_ALARM_AVAILABILITY =
  'Alerts work while Dextana is running, including with its window closed when background mode is enabled. While the app is fully quit or the device is asleep, alerts wait until Dextana next runs or the device wakes. Overdue alerts remain available until dismissed.';
const MAX_DURATION_SECONDS = 315_360_000;
const DOCUMENT_EXTENSIONS = new Set([
  '.xlsx',
  '.xls',
  '.ods',
  '.csv',
  '.tsv',
  '.docx',
  '.doc',
  '.odt',
  '.rtf',
  '.pdf',
  '.txt',
  '.md',
  '.json',
  '.pptx',
  '.ppt',
  '.odp',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
]);
export interface DesktopTimeFilesHost {
  storePath: string;
  /** Resolve only a file reference owned by this activity. Never accept a model-supplied path. */
  resolveFile(fileId: string, activityId: string): Promise<string> | string;
  openPath(path: string): Promise<string>;
  notify(alarm: DesktopAlarm): Promise<void> | void;
  onChange?(snapshot: DesktopAlarmSnapshot): void;
  now?(): number;
}
function duration(value: number) {
  if (!Number.isFinite(value) || value <= 0 || value > MAX_DURATION_SECONDS)
    throw new Error('Use a positive duration of at most ten years.');
  return Math.round(value * 1000);
}
function label(value: string, field: string, limit: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit)
    throw new Error(`Provide ${field} of at most ${limit} characters.`);
  return value.trim();
}
function validAlarmIdentity(alarm: DesktopAlarm) {
  return (
    typeof alarm.id === 'string' &&
    typeof alarm.title === 'string' &&
    typeof alarm.message === 'string' &&
    ['timer', 'reminder'].includes(alarm.kind) &&
    ['running', 'paused', 'ringing', 'dismissed', 'cancelled'].includes(alarm.state)
  );
}
function validAlarmTiming(alarm: DesktopAlarm) {
  return (
    Number.isFinite(Date.parse(alarm.createdAt)) &&
    Number.isFinite(alarm.remainingMs) &&
    alarm.remainingMs >= 0 &&
    Number.isSafeInteger(alarm.occurrence) &&
    alarm.occurrence >= 1
  );
}
function validAlarmDeadline(alarm: DesktopAlarm) {
  return (
    (alarm.dueAt === null || Number.isFinite(Date.parse(alarm.dueAt))) &&
    (alarm.state !== 'running' || alarm.dueAt !== null)
  );
}
function validAlarm(value: unknown): value is DesktopAlarm {
  if (!value || typeof value !== 'object') return false;
  const alarm = value as DesktopAlarm;
  return validAlarmIdentity(alarm) && validAlarmTiming(alarm) && validAlarmDeadline(alarm);
}
type CreationRequest = Extract<
  DesktopTimeFilesRequest,
  { operation: 'timer.start' | 'reminder.create' }
>;
type UpdateRequest = Extract<DesktopTimeFilesRequest, { id: string }>;
function creationDuration(request: CreationRequest, now: number) {
  if (request.operation === 'timer.start') return duration(request.durationSeconds);
  if (typeof request.dueAt !== 'string' || !/(?:Z|[+-]\d\d:\d\d)$/.test(request.dueAt))
    throw new Error('Use an ISO date and time with an explicit timezone offset.');
  return duration((Date.parse(request.dueAt) - now) / 1000);
}
function pauseTimer(alarm: DesktopAlarm, now: number) {
  if (alarm.kind !== 'timer' || alarm.state !== 'running')
    throw new Error('Only a running timer can be paused.');
  alarm.remainingMs = Math.max(0, Date.parse(alarm.dueAt!) - now);
  alarm.dueAt = null;
  alarm.state = 'paused';
}
function resumeTimer(alarm: DesktopAlarm, now: number) {
  if (alarm.kind !== 'timer' || alarm.state !== 'paused')
    throw new Error('Only a paused timer can be resumed.');
  alarm.dueAt = new Date(now + alarm.remainingMs).toISOString();
  alarm.state = 'running';
}
function snoozeAlarm(alarm: DesktopAlarm, seconds: number, now: number) {
  const remainingMs = duration(seconds);
  if (alarm.state !== 'ringing') throw new Error('Only a due alarm can be snoozed.');
  alarm.state = 'running';
  alarm.remainingMs = remainingMs;
  alarm.dueAt = new Date(now + remainingMs).toISOString();
  alarm.occurrence++;
  delete alarm.firedAt;
  delete alarm.overdue;
  delete alarm.notificationError;
}
function updateAlarm(alarm: DesktopAlarm, request: UpdateRequest, now: number) {
  switch (request.operation) {
    case 'timer.pause':
      pauseTimer(alarm, now);
      break;
    case 'timer.resume':
      resumeTimer(alarm, now);
      break;
    case 'reminder.snooze':
      snoozeAlarm(alarm, request.durationSeconds, now);
      break;
    case 'timer.cancel':
      alarm.state = 'cancelled';
      alarm.dueAt = null;
      break;
    case 'reminder.dismiss':
      alarm.state = 'dismissed';
      alarm.dueAt = null;
      break;
    default:
      throw new Error('Unsupported desktop alarm operation.');
  }
  return alarm;
}
/** Same durable state machine on macOS, Windows and Linux; host owns native presentation. */
export class DesktopTimeFiles {
  private alarms: DesktopAlarm[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private interval?: ReturnType<typeof setInterval>;
  private now: () => number;
  constructor(private host: DesktopTimeFilesHost) {
    this.now = host.now ?? Date.now;
  }
  async initialize() {
    try {
      const saved = JSON.parse(await readFile(this.host.storePath, 'utf8'));
      if (saved.version !== 1 || !Array.isArray(saved.alarms) || !saved.alarms.every(validAlarm))
        throw new Error('Desktop alarm storage is invalid; it was left untouched.');
      this.alarms = saved.alarms;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await this.tick();
    this.announce();
  }
  start() {
    if (!this.interval) {
      this.interval = setInterval(() => {
        void this.tick().catch(() => {
          /* Keep persisted deadlines for the next successful tick. */
        });
      }, 1000);
      this.interval.unref?.();
    }
  }
  async dispose() {
    if (this.interval) clearInterval(this.interval);
    this.interval = undefined;
    await this.queue;
  }
  snapshot(): DesktopAlarmSnapshot {
    return { alarms: structuredClone(this.alarms), availability: DESKTOP_ALARM_AVAILABILITY };
  }
  /** Import a delivered scheduler message once, using its durable message ID. */
  async ingestReminder(input: {
    id: string;
    sourceActivityId: string;
    title: string;
    body: string;
    deliveredAt: string;
    overdue?: boolean;
    notify?: boolean;
  }) {
    return this.serialized(async () => {
      const existing = this.alarms.find((a) => a.id === 'scheduled:' + input.id);
      if (existing) return structuredClone(existing);
      if (!Number.isFinite(Date.parse(input.deliveredAt)))
        throw new Error('The delivered reminder has an invalid timestamp.');
      const alarm: DesktopAlarm = {
        id: 'scheduled:' + input.id,
        kind: 'reminder',
        title: input.title.slice(0, 200),
        message: input.body.slice(0, 4000),
        sourceActivityId: input.sourceActivityId,
        createdAt: input.deliveredAt,
        dueAt: input.deliveredAt,
        remainingMs: 0,
        occurrence: 1,
        alertedOccurrence: 1,
        firedAt: new Date(this.now()).toISOString(),
        overdue: input.overdue ?? this.now() - Date.parse(input.deliveredAt) >= 60_000,
        state: 'ringing',
      };
      this.alarms.push(alarm);
      try {
        await this.commit();
      } catch (error) {
        this.alarms.pop();
        throw error;
      }
      if (input.notify !== false) await this.notify(alarm);
      return structuredClone(alarm);
    });
  }
  private serialized<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work);
    this.queue = result.catch(() => {});
    return result;
  }
  private async persist() {
    await mkdir(dirname(this.host.storePath), { recursive: true });
    const temporary = this.host.storePath + '.tmp';
    await writeFile(temporary, JSON.stringify({ version: 1, alarms: this.alarms }), {
      mode: 0o600,
      flush: true,
    });
    await rename(temporary, this.host.storePath);
  }
  private announce() {
    try {
      this.host.onChange?.(this.snapshot());
    } catch {
      /* A renderer observer cannot roll back an already durable alarm. */
    }
  }
  private async notify(alarm: DesktopAlarm) {
    try {
      await this.host.notify(structuredClone(alarm));
    } catch (error) {
      alarm.notificationError = error instanceof Error ? error.message : String(error);
      await this.commit();
    }
  }
  private async commit() {
    await this.persist();
    this.announce();
  }
  private find(id: string) {
    const alarm = this.alarms.find((entry) => entry.id === id);
    if (!alarm) throw new Error('Desktop alarm no longer exists. List alarms to obtain its ID.');
    return alarm;
  }
  async tick() {
    return this.serialized(async () => {
      const now = this.now();
      const due = this.alarms.filter(
        (a) => a.state === 'running' && a.dueAt && Date.parse(a.dueAt) <= now,
      );
      if (!due.length) return;
      const before = structuredClone(this.alarms);
      for (const alarm of due) {
        alarm.state = 'ringing';
        alarm.remainingMs = 0;
        alarm.firedAt = new Date(now).toISOString();
        alarm.overdue = now - Date.parse(alarm.dueAt!) >= 60_000;
        // Claim this occurrence durably before touching the OS. A crash may miss a
        // toast, but the visible ringing alarm persists and no alert is replayed.
        alarm.alertedOccurrence = alarm.occurrence;
      }
      try {
        await this.commit();
      } catch (error) {
        this.alarms = before;
        throw error;
      }
      for (const alarm of due) await this.notify(alarm);
    });
  }
  private duplicate(request: CreationRequest) {
    if (!request.requestId) return undefined;
    return this.alarms.find(
      (alarm) =>
        alarm.requestId === request.requestId &&
        alarm.sourceActivityId === request.sourceActivityId,
    );
  }
  private createAlarm(request: CreationRequest) {
    const existing = this.duplicate(request);
    if (existing) return existing;
    if (
      this.alarms.filter((alarm) => !['dismissed', 'cancelled'].includes(alarm.state)).length >= 100
    )
      throw new Error('Keep up to 100 active desktop alarms.');
    const now = this.now();
    const remainingMs = creationDuration(request, now);
    const title = label(request.title, 'a title', 200);
    const alarm: DesktopAlarm = {
      id: randomUUID(),
      kind: request.operation === 'timer.start' ? 'timer' : 'reminder',
      title,
      message: request.message ? label(request.message, 'a message', 4000) : title,
      state: 'running',
      createdAt: new Date(now).toISOString(),
      dueAt: new Date(now + remainingMs).toISOString(),
      remainingMs,
      sourceActivityId: request.sourceActivityId,
      requestId: request.requestId,
      occurrence: 1,
    };
    this.pruneHistory();
    this.alarms.push(alarm);
    return alarm;
  }
  private pruneHistory() {
    // Imported IDs are permanent receipts: backend snapshots may contain them
    // indefinitely, so evicting one would resurrect a dismissed reminder.
    const retired = this.alarms.filter(
      (alarm) =>
        !alarm.id.startsWith('scheduled:') && ['dismissed', 'cancelled'].includes(alarm.state),
    );
    if (retired.length >= 200)
      this.alarms = this.alarms.filter((alarm) => alarm.id !== retired[0].id);
  }
  private mutate(
    request: Exclude<DesktopTimeFilesRequest, { operation: 'file.open' | 'alarms.list' }>,
  ) {
    if (request.operation === 'timer.start' || request.operation === 'reminder.create')
      return this.createAlarm(request);
    return updateAlarm(this.find(request.id), request, this.now());
  }
  async execute(
    request: DesktopTimeFilesRequest,
  ): Promise<DesktopAlarmSnapshot | DesktopAlarm | { status: 'opened'; fileId: string }> {
    if (request.operation === 'file.open') {
      const path = await this.host.resolveFile(request.fileId, request.activityId);
      await openDocument(path, this.host.openPath);
      return { status: 'opened', fileId: request.fileId };
    }
    await this.tick();
    return this.serialized(async () => {
      if (request.operation === 'alarms.list') return this.snapshot();
      const before = structuredClone(this.alarms);
      try {
        const alarm = this.mutate(request);
        await this.commit();
        return structuredClone(alarm);
      } catch (error) {
        this.alarms = before;
        throw error;
      }
    });
  }
}
/** Shared safe default-app handoff for trusted, owner-selected local documents. */
export async function openDocument(
  path: string,
  openPath: (path: string) => Promise<string>,
): Promise<void> {
  if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0'))
    throw new Error('Choose a referenced local document.');
  if (!DOCUMENT_EXTENSIONS.has(extname(path).toLowerCase()))
    throw new Error('This file type cannot be opened as a work document.');
  const information = await lstat(path);
  if (information.isSymbolicLink() || !information.isFile())
    throw new Error('Choose a regular document file, not a folder or symbolic link.');
  const canonical = await realpath(path);
  if (!DOCUMENT_EXTENSIONS.has(extname(canonical).toLowerCase()))
    throw new Error('The document resolves to an unsupported file type.');
  const error = await openPath(canonical);
  if (error) throw new Error(`The desktop could not open this document: ${error}`);
}
