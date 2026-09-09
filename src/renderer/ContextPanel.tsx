import { Button, Card, TextInput, Icon } from './ui';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Activity, ContextItem } from '../shared/types';
const labels = {
  selected: 'Not read yet',
  read: 'Read',
  created: 'Created',
  referenced: 'Referenced',
  visited: 'Visited',
};
function locationLabel(item: ContextItem) {
  if (item.kind === 'desktop')
    return [item.desktop?.path ?? item.desktop?.work, item.desktop?.state]
      .filter(Boolean)
      .join(' · ');
  if (item.kind === 'url') {
    try {
      return new URL(item.location).hostname;
    } catch {
      return item.location;
    }
  }
  const parent = item.location.split(/[\\/]/).slice(0, -1).filter(Boolean).slice(-2).join(' / ');
  return parent || 'Local file';
}
function ContextIcon({ kind }: { kind: 'file' | 'url' | 'desktop' }) {
  if (kind === 'desktop') return <Icon name="desktop" />;
  return (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      aria-hidden="true"
    >
      {kind === 'file' ? (
        <>
          <path d="M5 2h6l4 4v12H5zM11 2v4h4M7 10h6M7 13h4" />
        </>
      ) : (
        <>
          <circle cx="10" cy="10" r="7" />
          <ellipse cx="10" cy="10" rx="3" ry="7" />
          <path d="M3 10h14" />
        </>
      )}
    </svg>
  );
}
function contextSummary(count: number) {
  if (!count) return 'Sources for this chat';
  return `${count} ${count === 1 ? 'source' : 'sources'} in this chat`;
}
export function ContextPanel({
  activity,
  changed,
  hidden = false,
  minimize,
}: {
  activity: Activity;
  hidden?: boolean;
  minimize: () => void;
  changed: () => Promise<void>;
}) {
  const [attaching, setAttaching] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const panel = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = panel.current!;
    const observer = new ResizeObserver(() =>
      element.parentElement?.style.setProperty(
        '--context-height',
        `${element.getBoundingClientRect().height}px`,
      ),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setQuery('');
    setMessage('');
    setError('');
    setExpanded({});
  }, [activity.id]);
  const items = activity.context ?? [];
  const filtered = items.filter((item) =>
    `${item.name} ${item.location} ${labels[item.status]}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  return (
    <Card
      as="aside"
      ref={panel}
      id="session-context"
      hidden={hidden}
      className="context-panel refined-context"
      role="region"
      aria-label="Agent context"
    >
      <div className="context-header">
        <div>
          <h2 className="context-heading">Context</h2>
          <p>{contextSummary(items.length)}</p>
        </div>
        <div className="context-header-actions">
          <Button
            variant="layout"
            className="context-minimize"
            aria-label="Minimize context"
            title="Minimize context"
            onClick={minimize}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="m4 6 4 4 4-4"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </Button>
        </div>
      </div>
      {items.length > 0 && (
        <div className="context-search">
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            aria-hidden="true"
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3 3" />
          </svg>
          <TextInput
            type="search"
            aria-label="Search context"
            placeholder="Find a source…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}
      {message && (
        <p role="status" className="context-help">
          {message}
        </p>
      )}
      {!items.length && (
        <div className="context-blank">
          <ContextIcon kind="file" />
          <strong>Your working sources</strong>
          <p>Attach a document or share a link. Files the agent reads and creates appear here.</p>
        </div>
      )}
      {query && !filtered.length && (
        <p className="context-empty" role="status">
          No matching context.
        </p>
      )}
      {(['file', 'url', 'desktop'] as const).map((kind) => {
        const group = filtered.filter((item) => item.kind === kind);
        const title = kind === 'file' ? 'Files' : kind === 'url' ? 'Links' : 'Desktop';
        if (query && !group.length) return null;
        return (
          <details
            className="context-group"
            key={kind}
            open={!!query || !!expanded[kind]}
            onToggle={(e) => {
              if (!query) {
                const open = e.currentTarget.open;
                setExpanded((value) => (value[kind] === open ? value : { ...value, [kind]: open }));
              }
            }}
          >
            <summary>
              {title}
              {kind === 'file' && (
                <Button
                  variant="layout"
                  className="context-attach"
                  aria-label="Attach context files"
                  title="Attach documents, PDFs, spreadsheets or images"
                  disabled={attaching}
                  onClick={async (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setAttaching(true);
                    setError('');
                    setMessage('');
                    try {
                      const paths = await window.dextana.pickFiles();
                      if (paths.length) {
                        await window.dextana.attachContext(activity.id, paths);
                        await changed();
                        setExpanded((e) => ({ ...e, file: true }));
                        setMessage('Files added to context');
                      }
                    } catch (failure) {
                      setError((failure as Error).message);
                    } finally {
                      setAttaching(false);
                    }
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M8 3v10M3 8h10"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                    />
                  </svg>
                </Button>
              )}
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
                  <span className={`context-file-icon context-${item.status}`}>
                    <ContextIcon kind={item.kind} />
                  </span>
                  <div className="context-item-content">
                    <strong title={item.name}>{item.name}</strong>
                    <p title={item.kind === 'desktop' ? locationLabel(item) : item.location}>
                      {locationLabel(item)}
                    </p>
                    <div className="context-item-meta">
                      <span className={`context-status status-${item.status}`}>
                        {labels[item.status]}
                      </span>
                      {item.kind === 'file' && (
                        <span className="context-extension">
                          {item.name.match(/\.([a-z0-9]{1,8})$/i)?.[1].toUpperCase() || 'FILE'}
                        </span>
                      )}
                    </div>
                    {item.kind === 'file' && (
                      <Button
                        variant="layout"
                        className="context-open"
                        aria-label={`Open ${item.name}`}
                        onClick={() => {
                          setError('');
                          void window.dextana
                            .openFile(activity.id, item.id)
                            .catch((failure) => setError((failure as Error).message));
                        }}
                      >
                        Open
                      </Button>
                    )}
                    <Button
                      variant="layout"
                      className="context-open"
                      aria-label={
                        item.kind === 'file' ? `Show ${item.name} in folder` : `Open ${item.name}`
                      }
                      onClick={() => {
                        setError('');
                        void (
                          item.kind === 'file'
                            ? window.dextana.revealFile(activity.id, item.id)
                            : item.kind === 'desktop'
                              ? window.dextana.openDesktopContext(activity.id, item.id)
                              : window.dextana.openLink(item.location)
                        ).catch((e) => setError(e.message));
                      }}
                    >
                      {item.kind === 'file'
                        ? 'Show in folder'
                        : item.kind === 'desktop'
                          ? 'View on desktop'
                          : 'Open link'}
                      <span aria-hidden="true"> ↗</span>
                    </Button>
                  </div>
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
    </Card>
  );
}
