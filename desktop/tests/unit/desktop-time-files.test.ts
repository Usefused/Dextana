import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DesktopTimeFiles, openDocument } from '../../src/main/desktop/time-files';
import type { DesktopAlarm } from '../../src/shared/desktop-time-files';
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'dextana-alarms-'));
  directories.push(directory);
  let now = 1_800_000_000_000;
  const notifications: DesktopAlarm[] = [];
  const host = {
    storePath: join(directory, 'alarms.json'),
    now: () => now,
    resolveFile: (id: string, activity: string) => {
      if (activity !== 'chat' || id !== 'file') throw new Error('Unknown file reference');
      return join(directory, 'budget.xlsx');
    },
    openPath: vi.fn(async (_path: string) => ''),
    notify: (alarm: DesktopAlarm) => {
      notifications.push(alarm);
    },
  };
  const service = new DesktopTimeFiles(host);
  await service.initialize();
  return {
    directory,
    service,
    host,
    notifications,
    advance: (ms: number) => {
      now += ms;
    },
    now: () => now,
  };
}
describe('durable desktop alarms', () => {
  it('keeps committed state authoritative when a snapshot observer fails', async () => {
    const work = await setup();
    const service = new DesktopTimeFiles({
      ...work.host,
      onChange: () => {
        throw new Error('Renderer unavailable');
      },
    });
    await service.initialize();
    const created = (await service.execute({
      operation: 'timer.start',
      title: 'Durable despite renderer',
      durationSeconds: 30,
    })) as DesktopAlarm;
    expect(service.snapshot().alarms[0].id).toBe(created.id);
    const restored = new DesktopTimeFiles(work.host);
    await restored.initialize();
    expect(restored.snapshot().alarms[0].id).toBe(created.id);
  });
  it('pauses across restart, resumes remaining time, rings once, snoozes, and dismisses durably', async () => {
    const work = await setup();
    const timer = (await work.service.execute({
      operation: 'timer.start',
      title: 'Tea',
      durationSeconds: 30,
    })) as DesktopAlarm;
    work.advance(12_000);
    const paused = (await work.service.execute({
      operation: 'timer.pause',
      id: timer.id,
    })) as DesktopAlarm;
    expect(paused.remainingMs).toBe(18_000);
    work.advance(100_000);
    const restored = new DesktopTimeFiles(work.host);
    await restored.initialize();
    expect(work.notifications).toHaveLength(0);
    await restored.execute({ operation: 'timer.resume', id: timer.id });
    work.advance(17_999);
    await restored.tick();
    expect(work.notifications).toHaveLength(0);
    work.advance(1);
    await restored.tick();
    await restored.tick();
    expect(work.notifications).toHaveLength(1);
    expect(restored.snapshot().alarms[0].state).toBe('ringing');
    await restored.execute({ operation: 'reminder.snooze', id: timer.id, durationSeconds: 5 });
    work.advance(5_000);
    await restored.tick();
    expect(work.notifications).toHaveLength(2);
    await restored.execute({ operation: 'reminder.dismiss', id: timer.id });
    const final = new DesktopTimeFiles(work.host);
    await final.initialize();
    expect(final.snapshot().alarms[0].state).toBe('dismissed');
    expect(work.notifications).toHaveLength(2);
  });
  it('retains overdue reminders after shutdown without replaying delivered notifications', async () => {
    const work = await setup();
    const request = {
      operation: 'reminder.create' as const,
      title: 'Invoice',
      message: 'Send invoice',
      dueAt: new Date(work.now() + 10_000).toISOString(),
      requestId: 'receipt',
      sourceActivityId: 'chat',
    };
    const first = (await work.service.execute(request)) as DesktopAlarm;
    const duplicate = (await work.service.execute(request)) as DesktopAlarm;
    expect(duplicate.id).toBe(first.id);
    work.advance(120_000);
    const restored = new DesktopTimeFiles(work.host);
    await restored.initialize();
    expect(work.notifications).toHaveLength(1);
    expect(work.notifications[0].overdue).toBe(true);
    const again = new DesktopTimeFiles(work.host);
    await again.initialize();
    expect(work.notifications).toHaveLength(1);
    expect(again.snapshot().alarms[0].state).toBe('ringing');
  });
  it('imports scheduled message receipts once and preserves snooze against repeated snapshots', async () => {
    const work = await setup();
    const input = {
      id: 'message',
      title: 'Reminder',
      body: 'Pay invoice',
      sourceActivityId: 'chat',
      deliveredAt: new Date(work.now()).toISOString(),
    };
    const alarm = await work.service.ingestReminder(input);
    await work.service.execute({
      operation: 'reminder.snooze',
      id: alarm.id,
      durationSeconds: 300,
    });
    await work.service.ingestReminder(input);
    expect(work.service.snapshot().alarms).toHaveLength(1);
    expect(work.service.snapshot().alarms[0].state).toBe('running');
    const restored = new DesktopTimeFiles(work.host);
    await restored.initialize();
    await restored.ingestReminder(input);
    expect(work.notifications).toHaveLength(1);
  });
  it('leaves failed native alerts visible and rejects invalid state transitions and times', async () => {
    const work = await setup();
    work.host.notify = () => {
      throw new Error('Notifications are disabled');
    };
    const timer = (await work.service.execute({
      operation: 'timer.start',
      title: 'Timer',
      durationSeconds: 1,
    })) as DesktopAlarm;
    await expect(work.service.execute({ operation: 'timer.resume', id: timer.id })).rejects.toThrow(
      'paused',
    );
    await expect(
      work.service.execute({
        operation: 'reminder.create',
        title: 'Bad date',
        message: 'No zone',
        dueAt: '2026-09-09T12:00:00',
      }),
    ).rejects.toThrow('timezone');
    work.advance(1000);
    await work.service.tick();
    expect(work.service.snapshot().alarms[0].notificationError).toContain('disabled');
    await work.service.tick();
    expect(work.service.snapshot().alarms[0].state).toBe('ringing');
  });
  it('serializes concurrent ticks and cancellation so due alarms cannot notify twice', async () => {
    const work = await setup();
    await work.service.execute({ operation: 'timer.start', title: 'Once', durationSeconds: 1 });
    work.advance(1000);
    await Promise.all([work.service.tick(), work.service.tick(), work.service.tick()]);
    expect(work.notifications).toHaveLength(1);
  });
  it('waits for the serialized delivery to finish before shutdown', async () => {
    const work = await setup();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    work.host.notify = async () => {
      await held;
    };
    await work.service.execute({ operation: 'timer.start', title: 'Shutdown', durationSeconds: 1 });
    work.advance(1000);
    const ticking = work.service.tick();
    let stopped = false;
    const stopping = work.service.dispose().then(() => {
      stopped = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(stopped).toBe(false);
    release();
    await Promise.all([ticking, stopping]);
    const restored = new DesktopTimeFiles(work.host);
    await restored.initialize();
    expect(restored.snapshot().alarms[0].state).toBe('ringing');
  });
  it('never prunes imported reminder receipts when retiring local timer history', async () => {
    const work = await setup();
    const input = {
      id: 'historical',
      title: 'Old reminder',
      body: 'Done',
      sourceActivityId: 'chat',
      deliveredAt: new Date(work.now()).toISOString(),
      notify: false,
    };
    const imported = await work.service.ingestReminder(input);
    await work.service.execute({ operation: 'reminder.dismiss', id: imported.id });
    const receipt = work.service.snapshot().alarms[0];
    const alarms = [
      receipt,
      ...Array.from({ length: 200 }, (_, index) => ({
        ...receipt,
        id: 'retired-' + index,
        kind: 'timer',
        state: 'cancelled',
      })),
    ];
    await writeFile(work.host.storePath, JSON.stringify({ version: 1, alarms }));
    const restored = new DesktopTimeFiles(work.host);
    await restored.initialize();
    await restored.execute({ operation: 'timer.start', title: 'New', durationSeconds: 10 });
    await restored.ingestReminder(input);
    expect(restored.snapshot().alarms.find((a) => a.id === imported.id)?.state).toBe('dismissed');
    expect(work.notifications).toHaveLength(0);
  });
});
describe('default application document opening', () => {
  it('opens only a referenced regular document and propagates native handler failures', async () => {
    const work = await setup();
    const path = join(work.directory, 'budget.xlsx');
    await writeFile(path, 'fixture');
    expect(
      await work.service.execute({ operation: 'file.open', fileId: 'file', activityId: 'chat' }),
    ).toEqual({ status: 'opened', fileId: 'file' });
    expect(work.host.openPath).toHaveBeenCalledTimes(1);
    await expect(
      work.service.execute({ operation: 'file.open', fileId: 'file', activityId: 'other-chat' }),
    ).rejects.toThrow('Unknown file');
    work.host.openPath.mockResolvedValue('No application is associated');
    await expect(openDocument(path, work.host.openPath)).rejects.toThrow('No application');
    const link = join(work.directory, 'linked.xlsx');
    await symlink(path, link);
    await expect(openDocument(link, work.host.openPath)).rejects.toThrow('symbolic link');
    await expect(openDocument(join(work.directory, 'run.sh'), work.host.openPath)).rejects.toThrow(
      'file type',
    );
    await expect(
      openDocument(join(work.directory, 'gone.docx'), work.host.openPath),
    ).rejects.toThrow();
    expect(work.host.openPath).toHaveBeenCalledTimes(2);
  });
});
