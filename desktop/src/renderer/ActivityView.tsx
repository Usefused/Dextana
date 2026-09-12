import { displayTitle } from '../shared/titles';
import { MessageContent } from './MessageContent';
import { Thought } from './Thought';
import { WorkPlan } from './WorkPlan';
import { ActionApproval } from './ActionApproval';
import type { Activity } from '../shared/types';
import { Fragment, useState } from 'react';
import { turnEvents } from '../shared/turn-events';
import { IconButton } from './ui';
import { EditMessage } from './EditMessage';
import { LiveQuestions } from './LiveQuestions';
export function ActivityView({ activity, edited }: { activity: Activity; edited: () => void }) {
  const logs = turnEvents(activity.messages, activity.events);
  const running = ['starting', 'running'].includes(activity.status);
  const [editing, setEditing] = useState<string>();
  const lastUser = activity.messages.findLast(message => message.role === 'user' && !message.generated);
  const ownerChat = !activity.parentId && !activity.archived;
  const editable = ownerChat && !running && !activity.approval && !activity.queue?.length;
  const awaitingAnswer = activity.questions?.some(question => question.status === 'pending');
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
        {activity.messages.map((message, index) => (
          <Fragment key={message.id}><article className={`message ${message.role}${editing === message.id ? ' message-editing' : ''}`}>
            {message.createdAt && Number.isFinite(Date.parse(message.createdAt)) && <time className="message-time" dateTime={message.createdAt}>
              {new Date(message.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </time>}
            <div className="message-bubble">
            {message.role === 'user' && <div className="message-author"><span>{message.generated ? 'Dextana' : 'You'}{message.editedAt && ' · Edited'}</span>
            </div>}
            {message.thought?.text && <Thought thought={message.thought} pending={running && message.id === activity.messages.at(-1)?.id && !message.content} />}
            {editing === message.id ? <EditMessage activityId={activity.id} message={message} available={!!editable && lastUser?.id === message.id} cancel={() => setEditing(undefined)} saved={() => { setEditing(undefined); edited(); }} /> : <div data-testid={message.role === 'assistant' ? 'assistant-message' : undefined}>
              {message.role === 'assistant' && message.content ? (
                <MessageContent
                  content={message.content}
                  streaming={!!running && message.id === activity.messages.at(-1)?.id}
                  reply={{
                    answered: activity.messages.some(item => item.replyToMessageId === message.id),
                    closed: activity.messages.slice(index + 1).some(item => item.role === 'user' && !item.generated) ? 'continued' : undefined,
                    send: editable && activity.status === 'completed' && message.id === activity.messages.at(-1)?.id ? async prompt => {
                      await window.dextana.start({ activityId: activity.id, prompt,
                        replyToMessageId: message.id,
                        model: activity.modelSelection?.model ?? activity.model,
                        reasoning: activity.modelSelection?.reasoning ?? activity.reasoning,
                        mode: activity.mode });
                      edited();
                    } : undefined,
                  }}
                />
              ) : (
                message.content ||
                (running ? '' : 'No response received.')
              )}
            </div>}
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
            </div>
            {ownerChat && message.id === lastUser?.id && !message.generated && editing !== message.id && <div className="message-hover-actions"><IconButton variant="plain" icon="edit" label="Edit last message" title={editable ? 'Edit last message' : 'Stop the current run and finish queued messages to edit'} disabled={!editable} onClick={() => setEditing(message.id)} /></div>}
          </article>
          {!!logs.turns.get(index)?.length && <details className="activity-events turn-events" aria-label="Turn activity log">
            <summary>Activity log · {logs.turns.get(index)!.length} events</summary>
            {logs.turns.get(index)!.map((event, i) => <p key={i}>{event}</p>)}
          </details>}
          </Fragment>
        ))}
        <LiveQuestions activity={activity} replied={edited} />
        {running && <p className="agent-progress" role="status" aria-label="Agent progress">
          <span className="agent-progress-dot" aria-hidden="true" />
          {activity.approval ? 'Waiting for your permission…' : awaitingAnswer ? 'Waiting for your answer…' : 'Working…'}
        </p>}
      </div>
      {logs.earlier.length > 0 && (
        <details className="activity-events">
          <summary>Earlier activity · {logs.earlier.length} events</summary>
          {logs.earlier.map((event, i) => (
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
