import { useState } from 'react';
import type { Activity } from '../shared/types';
const labels = {
  selected: 'Selected · Not read',
  read: 'Read',
  created: 'Created',
  referenced: 'Referenced',
  visited: 'Visited',
};
export function ContextPanel({
  activity,
  changed,
}: {
  activity: Activity;
  changed: () => Promise<void>;
}) {
  const [attaching, setAttaching] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const items = activity.context ?? [];
  return (
    <aside className="context-panel" role="region" aria-label="Agent context">
      <button
        className="context-attach"
        aria-label="Attach context files"
        title="Attach Excel, Word, PDF or text files"
        disabled={attaching}
        onClick={async () => {
          setAttaching(true);
          setError('');
          setMessage('');
          try {
            const paths = await window.dextana.pickFiles();
            if (paths.length) {
              await window.dextana.attachContext(activity.id, paths);
              await changed();
              setMessage('Files added to context');
            }
          } catch (failure) {
            setError((failure as Error).message);
          } finally {
            setAttaching(false);
          }
        }}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </button>
      <h2 className="context-heading">Context</h2>
      <div key={activity.id}>
        {message && (
          <p role="status" className="context-help">
            {message}
          </p>
        )}
        {!items.length && (
          <p className="context-empty">Add work documents or share a link to get started.</p>
        )}
        {(['file', 'url'] as const).map((kind) => {
          const group = items.filter((item) => item.kind === kind);
          const title = kind === 'file' ? 'Files' : 'Links';
          return (
            <details className="context-group" key={kind}>
              <summary>
                {title}
                <span>{group.length}</span>
              </summary>
              {!group.length && <p className="context-empty">No {title.toLowerCase()} yet.</p>}
              <div
                className="context-items"
                role="region"
                aria-label={`${title} in context`}
                tabIndex={0}
              >
                {group.map((item) => (
                  <article key={item.id} className="context-item">
                    <div className="context-kind">
                      {item.kind === 'file' ? 'Document' : 'Web page'} · {labels[item.status]}
                    </div>
                    <strong title={item.location}>{item.name}</strong>
                    <p title={item.location}>{item.location}</p>
                    <button
                      className="context-open"
                      aria-label={
                        item.kind === 'file' ? `Show ${item.name} in folder` : `Open ${item.name}`
                      }
                      onClick={() => {
                        setError('');
                        void (
                          item.kind === 'file'
                            ? window.dextana.revealFile(activity.id, item.id)
                            : window.dextana.openLink(item.location)
                        ).catch((e) => setError(e.message));
                      }}
                    >
                      {item.kind === 'file' ? 'Show in folder ↗' : 'Open link ↗'}
                    </button>
                  </article>
                ))}
              </div>
            </details>
          );
        })}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </div>
    </aside>
  );
}
