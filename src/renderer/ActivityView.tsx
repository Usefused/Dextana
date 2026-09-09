import { displayTitle } from '../shared/titles';
import { MessageContent } from './MessageContent';
import { Thought } from './Thought';
import { WorkPlan } from './WorkPlan';
import { ActionApproval } from './ActionApproval';
import type { Activity } from '../shared/types';
export function ActivityView({ activity }: { activity: Activity }) {
  const running = ['starting', 'running'].includes(activity.status);
  return (
    <section className="activity-view">
      <div className="activity-heading">
        <div>
          <div className="eyebrow">{activity.parentId ? 'Delegated activity' : 'ACTIVITY'}</div>
          <h1>{displayTitle(activity.title)}</h1>
        </div>
        <span className={`status ${activity.status}`} data-testid="activity-status">
          {activity.approval ? 'Needs approval' : activity.status === 'awaiting_plan' ? 'Plan ready' : activity.status[0].toUpperCase() + activity.status.slice(1)}
        </span>
      </div>
      {activity.browser?.saveError && <p role="alert" className="error">{activity.browser.saveError}</p>}
      <div className="messages">
        {activity.messages.map((message) => (
          <article key={message.id} className={`message ${message.role}`}>
            {message.role === 'user' && <div className="message-author">You</div>}
            {message.thought?.text && <Thought thought={message.thought} pending={running && message.id === activity.messages.at(-1)?.id && !message.content} />}
            <div data-testid={message.role === 'assistant' ? 'assistant-message' : undefined}>
              {message.role === 'assistant' && message.content ? (
                <MessageContent
                  content={message.content}
                  streaming={!!running && message.id === activity.messages.at(-1)?.id}
                />
              ) : (
                message.content ||
                (message.thought?.runningSince !== undefined
                  ? ''
                  : running
                    ? activity.approval ? 'Waiting for your permission…' : 'Working…'
                    : 'No response received.')
              )}
            </div>
            {message.role === 'assistant' && message.id === activity.messages.at(-1)?.id && activity.approval && <ActionApproval key={activity.approval.id} activityId={activity.id} approval={activity.approval} />}
            {activity.plans?.filter(plan => plan.messageId === message.id).map(plan => <WorkPlan key={plan.id} plan={plan} activity={activity} />)}
            {message.role === 'assistant' && message.content && (
              <div className="message-model" aria-label="Response model">
                {displayTitle(message.model || activity.model)}
              </div>
            )}
            {!!message.files?.length && (
              <ul className="message-files" aria-label="Message attachments">
                {message.files.map((path, index) => (
                  <li key={`${path}-${index}`} title={path}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M9 2H4v12h8V5L9 2Zm0 0v3h3M6 8h4M6 10h4" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" /></svg>
                    <span>{path.split(/[\\/]/).at(-1)}</span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>
      {activity.events.length > 0 && (
        <details className="activity-events">
          <summary>Activity log · {activity.events.length} events</summary>
          {activity.events.map((event, i) => (
            <p key={i}>{event}</p>
          ))}
        </details>
      )}
      {activity.error && (
        <div role="alert" className="error">
          {activity.error}
        </div>
      )}
      {activity.status === 'interrupted' && (
        <p className="muted">
          This activity was interrupted when the app closed. Send a follow-up to continue with the
          saved conversation.
        </p>
      )}
    </section>
  );
}
