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
      <details open>
        <summary>Context</summary>
        <p className="context-help">
          Files and links used in this chat. Reading a selected file still needs permission.
        </p>
        {message && (
          <p role="status" className="context-help">
            {message}
          </p>
        )}
        {!items.length && (
          <p className="context-empty">Add work documents or share a link to get started.</p>
        )}
        <div className="context-items">
          {items.map((item) => (
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
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </details>
    </aside>
  );
}
