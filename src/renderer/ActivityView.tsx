import { useState } from 'react';
import { displayTitle } from '../shared/titles';
import { MessageContent } from './MessageContent';
import { Thought } from './Thought';
import { ActionApproval, AutomaticAccess } from './ActionApproval';
import type { Activity } from '../shared/types';
export function ActivityView({ activity }: { activity: Activity }) {
  const [openingBrowser, setOpeningBrowser] = useState(false);
  const [browserError, setBrowserError] = useState('');
  const running = ['starting', 'running'].includes(activity.status);
  return (
    <section className="activity-view">
      <div className="activity-heading">
        <div>
          <div className="eyebrow">{activity.parentId ? 'Delegated activity' : 'ACTIVITY'}</div>
          <h1>{displayTitle(activity.title)}</h1>
        </div>
        <span className={`status ${activity.status}`} data-testid="activity-status">
          {activity.approval ? 'Needs approval' : activity.status[0].toUpperCase() + activity.status.slice(1)}
        </span>
      </div>
      {activity.browser && (
        <div className="activity-info">
          <button
            className="secondary"
            disabled={openingBrowser}
            onClick={async () => {
              setOpeningBrowser(true); setBrowserError('');
              try { await window.dextana.showBrowser(activity.id); }
              catch (error) { setBrowserError((error as Error).message); }
              finally { setOpeningBrowser(false); }
            }}
          >
            {openingBrowser ? 'Opening browser…' : activity.browser.needsReopen ? 'Reopen browser' : 'Show browser'}
          </button>
          {activity.browser.needsReopen && <span className="saved-browser-page" title={activity.browser.url}>Last page: {new URL(activity.browser.url).hostname}</span>}
          {(browserError || activity.browser.saveError) && <p role="alert" className="error">{browserError || activity.browser.saveError}</p>}
        </div>
      )}
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
            {message.role === 'assistant' && message.content && (
              <div className="message-model" aria-label="Response model">
                {displayTitle(message.model)}
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
      <AutomaticAccess key={activity.id} activity={activity} />
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
