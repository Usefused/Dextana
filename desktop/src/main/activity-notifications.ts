import type { Activity } from '../shared/types';
import type { NotificationInput, Notify } from '../shared/notifications';
import { displayTitle } from '../shared/titles';

function event(activity: Activity): NotificationInput | undefined {
  if (activity.archived) return;
  const user = activity.messages.findLast((message) => message.role === 'user');
  const turn = `${user?.id ?? 'initial'}:${user?.editedAt ?? ''}`;
  const base = {
    source: 'Chats',
    body: displayTitle(activity.title),
    target: { kind: 'activity' as const, activityId: activity.id },
  };
  const question = activity.questions?.findLast((item) => item.status === 'pending');
  if (question)
    return {
      ...base,
      title: 'An agent has a question',
      body: question.sourceTitle,
      key: `${activity.id}:question:${question.id}`,
    };
  if (activity.approval)
    return {
      ...base,
      title: 'Approval needed',
      severity: 'warning',
      key: `${activity.id}:approval:${activity.approval.id}`,
    };
  if (activity.status === 'awaiting_plan')
    return {
      ...base,
      title: 'Plan ready for review',
      key: `${activity.id}:plan:${activity.plans?.at(-1)?.id ?? turn}`,
    };
  if (activity.status === 'failed')
    return {
      ...base,
      title: 'Chat failed',
      severity: 'error',
      key: `${activity.id}:${turn}:failed`,
    };
  if (['starting', 'running'].includes(activity.status) && activity.error)
    return {
      ...base,
      title: 'Chat needs attention',
      severity: 'error',
      key: `${activity.id}:${turn}:error:${activity.error}`,
    };
  // Parent chats report their workers' outcomes; workers still alert for consent or errors.
  if (activity.status === 'completed' && !activity.parentId)
    return {
      ...base,
      title: 'Chat finished',
      severity: 'success',
      key: `${activity.id}:${turn}:completed`,
    };
}

/** Observes existing snapshots, including local approvals; no model calls or polling. */
export class ActivityNotifications {
  private latest = new Map<string, NotificationInput | undefined>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  constructor(
    initial: Activity[],
    private isViewing: (activityId: string) => boolean,
    private notify: Notify,
    private failed: (error: unknown) => void,
  ) {
    // Loading historical completions/approvals must not replay notifications.
    this.latest = new Map(initial.map((activity) => [activity.id, event(activity)]));
  }

  update(activities: Activity[]) {
    const previous = this.latest;
    this.latest = new Map(activities.map((activity) => [activity.id, event(activity)]));
    for (const [id, item] of this.latest) {
      if (!item || item.key === previous.get(id)?.key || this.isViewing(id)) continue;
      clearTimeout(this.timers.get(id));
      // Give a newly started chat time to become selected before deciding it is background work.
      this.timers.set(
        id,
        setTimeout(() => {
          this.timers.delete(id);
          if (this.latest.get(id)?.key !== item.key || this.isViewing(id)) return;
          void this.notify(item).catch(this.failed);
        }, 400),
      );
    }
  }

  dispose() {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}
