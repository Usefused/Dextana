import { useEffect, useRef, useState } from 'react';
import type { AppNotification, NotificationCommand } from '../shared/notifications';
import { Button, Modal, Notice } from './ui';
import './notifications.css';

export function NotificationCenter({ items }: { items?: AppNotification[] }) {
  const [open, setOpen] = useState(false);
  const [toastId, setToastId] = useState<string>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const seen = useRef<Set<string> | undefined>(undefined);
  const visible = (items ?? []).filter((item) => !item.dismissedAt);
  const unread = visible.filter((item) => !item.readAt).length;
  const toast = visible.find((item) => item.id === toastId && !item.readAt);
  useEffect(() => window.dextana.onOpenNotifications(() => setOpen(true)), []);
  useEffect(() => {
    if (!items) return;
    if (seen.current) {
      const newest = items.find(
        (item) => !seen.current!.has(item.id) && !item.dismissedAt && !item.readAt,
      );
      if (newest) setToastId(newest.id);
    }
    seen.current = new Set(items.map((item) => item.id));
  }, [items]);
  useEffect(() => {
    if (!toastId) return;
    const timer = window.setTimeout(() => setToastId(undefined), 8000);
    return () => window.clearTimeout(timer);
  }, [toastId]);

  async function act(command: NotificationCommand) {
    setBusy(true);
    setError('');
    try {
      await window.dextana.notification(command);
      if (command.action === 'open') {
        setOpen(false);
        setToastId(undefined);
      }
    } catch (error) {
      setError((error as Error).message);
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        className="notification-trigger"
        aria-label="Notifications"
        onClick={() => {
          setOpen(true);
          setToastId(undefined);
        }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M5 8a5 5 0 0 1 10 0v4l2 3H3l2-3V8Zm3 9h4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {unread > 0 && (
          <span className="notification-count" aria-label={`${unread} unread notifications`}>
            {unread}
          </span>
        )}
      </Button>
      {open && (
        <Modal
          title="Notifications"
          closeLabel="Close notifications"
          close={() => setOpen(false)}
          actions={
            <Button
              variant="secondary"
              disabled={!unread || busy}
              onClick={() => void act({ action: 'readAll' })}
            >
              Mark all read
            </Button>
          }
        >
          {error && <Notice tone="danger">{error}</Notice>}
          {!visible.length && (
            <p className="muted">
              You’re all caught up. Notifications from your services will appear here.
            </p>
          )}
          <div className="notification-list">
            {visible.map((item) => (
              <article
                key={item.id}
                className="notification-item"
                data-unread={!item.readAt}
                data-severity={item.severity}
                aria-label={item.title}
              >
                <div className="notification-meta">
                  <span>{item.source}</span>
                  <span>{item.severity ?? 'info'}</span>
                  <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
                </div>
                <h3>
                  {item.title}
                  {!item.readAt && <span className="notification-unread" aria-label="Unread" />}
                </h3>
                <p>{item.body}</p>
                <div className="dx-actions">
                  {item.target && (
                    <Button
                      size="small"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void act({ action: 'open', id: item.id })}
                    >
                      View
                    </Button>
                  )}
                  {!item.readAt && (
                    <Button
                      size="small"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void act({ action: 'read', id: item.id })}
                    >
                      Mark read
                    </Button>
                  )}
                  <Button
                    size="small"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void act({ action: 'dismiss', id: item.id })}
                  >
                    Dismiss
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </Modal>
      )}
      {toast && !open && (
        <div className="notification-toast" role="status">
          <strong>{toast.title}</strong>
          <p>{toast.body}</p>
          <div className="dx-actions">
            <Button
              size="small"
              variant="secondary"
              onClick={() => {
                setOpen(true);
                setToastId(undefined);
              }}
            >
              View notifications
            </Button>
            <Button
              size="small"
              variant="ghost"
              aria-label="Hide notification banner"
              onClick={() => setToastId(undefined)}
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
