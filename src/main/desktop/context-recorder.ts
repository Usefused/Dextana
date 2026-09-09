import type { ComputerSnapshot } from '../../shared/desktop-computer';
import { basename, extname } from 'node:path';
import type { DesktopAlarm } from '../../shared/desktop-time-files';
import type { DesktopWorkflowSnapshot, DesktopProcessingJob } from '../../shared/desktop-workflows';
import type { DesktopContext } from '../../shared/desktop';
import type { Activity } from '../../shared/types';
import { rememberDesktop, rememberFile, rememberURL } from '../context';
import { documentExtensions } from '../files';
import type { Store } from '../store';

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/** Translate device state into chat references without exposing desktop internals to the renderer. */
export class DesktopContextRecorder {
  constructor(private store: Store) {}

  private activity(id?: string) {
    return this.store.state.activities.find((activity) => activity.id === id);
  }

  resetComputer() {
    for (const activity of this.store.state.activities)
      for (const item of activity.context ?? [])
        if (item.desktop?.work === 'computer')
          rememberDesktop(activity, item.name, { ...item.desktop, state: 'stopped' });
  }

  computer(snapshot: ComputerSnapshot) {
    this.store.state.desktopComputer = snapshot;
    const selected = snapshot.selection;
    if (!selected) return;
    const activity = this.activity(selected.activityId);
    if (activity)
      rememberDesktop(activity, selected.window.application, {
        work: 'computer',
        resourceId: selected.id,
        operation: 'computer.observe',
        state: selected.state,
        path: selected.window.title,
      });
  }

  alarm(alarm: DesktopAlarm) {
    const activity = this.activity(alarm.sourceActivityId);
    if (activity)
      rememberDesktop(activity, alarm.title, {
        work: 'time',
        resourceId: alarm.id,
        operation: alarm.kind,
        state: alarm.state,
      });
  }

  workflows(snapshot: DesktopWorkflowSnapshot) {
    this.store.state.desktopWorkflows = snapshot;
    for (const rule of snapshot.watches) {
      const activity = this.activity(rule.activityId);
      if (activity)
        rememberDesktop(activity, rule.name, {
          work: 'workflows',
          resourceId: rule.id,
          operation: 'workflow.watch_save',
          state: rule.status,
          path: rule.folder,
        });
    }
    snapshot.jobs.forEach((job) => this.job(job));
    for (const batch of snapshot.renames) {
      const activity = this.activity(batch.activityId);
      if (activity)
        rememberDesktop(activity, `Rename ${batch.entries.length} files`, {
          work: 'workflows',
          resourceId: batch.id,
          operation: 'workflow.rename_preview',
          state: batch.status,
        });
    }
  }

  private job(job: DesktopProcessingJob) {
    const activity = this.activity(job.activityId);
    if (!activity) return;
    rememberDesktop(activity, `${job.kind} · ${basename(job.outputPath)}`, {
      work: 'processing',
      resourceId: job.id,
      operation: 'processing.start',
      state: job.status,
    });
    if (
      job.status === 'completed' &&
      documentExtensions.includes(extname(job.outputPath).slice(1).toLowerCase())
    )
      rememberFile(activity, job.outputPath, 'created');
  }

  fileOpened(fileId: string, activityId: string) {
    const activity = this.activity(activityId);
    if (!activity) return;
    const file = activity.context?.find((item) => item.id === fileId && item.kind === 'file');
    if (!file) throw new Error('This file is not in the chat context.');
    rememberDesktop(activity, `Default app · ${file.name}`, {
      work: 'files',
      resourceId: fileId,
      operation: 'file.open',
      state: 'opened',
    });
  }

  workflow(
    operation: string,
    args: Record<string, unknown>,
    value: unknown,
    context: DesktopContext,
  ) {
    const activity = this.activity(context.activityId);
    if (!activity) return;
    const result = record(value);
    switch (operation) {
      case 'workflow.watch_remove':
        this.watchRemoved(activity, result.removed);
        break;
      case 'workflow.handoff':
        this.handoff(activity, result.opened);
        break;
      case 'workflow.setup_open':
        this.setupOpened(activity, result.results);
        break;
      case 'workflow.notify':
        rememberDesktop(activity, String(args.title), {
          work: 'workflows',
          resourceId: operation,
          operation,
          state: 'notification requested',
        });
        break;
      case 'device.power_policy':
        rememberDesktop(activity, 'Device power policy', {
          work: 'device',
          resourceId: operation,
          operation,
          state: result.pauseOnBattery ? 'pause on battery' : 'run on battery',
        });
        break;
    }
  }

  private watchRemoved(activity: Activity, removed: unknown) {
    const reference = activity.context?.find((item) => item.desktop?.resourceId === removed);
    if (reference?.desktop)
      rememberDesktop(activity, reference.name, { ...reference.desktop, state: 'removed' });
  }

  private handoff(activity: Activity, path: unknown) {
    if (typeof path !== 'string') return;
    rememberFile(activity, path, 'selected');
    rememberDesktop(activity, `Default app · ${basename(path)}`, {
      work: 'workflows',
      resourceId: path,
      operation: 'workflow.handoff',
      state: 'opened',
    });
  }

  private setupOpened(activity: Activity, results: unknown) {
    if (!Array.isArray(results)) return;
    for (const value of results) {
      const item = record(value);
      if (!item.opened) continue;
      if (typeof item.url === 'string') rememberURL(activity, item.url, 'visited');
      if (typeof item.path === 'string')
        rememberDesktop(activity, basename(item.path), {
          work: 'workflows',
          resourceId: item.path,
          operation: 'workflow.setup_open',
          state: 'opened',
        });
    }
  }
}
