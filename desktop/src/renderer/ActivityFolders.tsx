import { TextInput, Button, Select, Icon } from './ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Activity, ConversationFolder } from '../shared/types';

type Feedback = { changed: (message?: string) => Promise<void>; failed: (message: string) => void };
export function ActivityFolders({
  view,
  onViewChange,
  activities,
  newChat,
  folders,
  renderActivity,
  changed,
  failed,
}: Feedback & {
  view: 'activities' | 'cron' | 'desktop';
  onViewChange: (view: 'activities' | 'cron' | 'desktop') => void;
  newChat: (folderId: string) => void;
  activities: Activity[];
  folders: ConversationFolder[];
  renderActivity: (activity: Activity) => ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const closeOutside = (event: Event) => {
      root.current?.querySelectorAll<HTMLDetailsElement>('.folder-menu[open]').forEach(menu => {
        if (event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
      });
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      root.current?.querySelectorAll<HTMLDetailsElement>('.folder-menu[open]').forEach(menu => {
        menu.open = false;
        menu.querySelector('summary')?.focus();
      });
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('focusin', closeOutside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('focusin', closeOutside);
      document.removeEventListener('keydown', escape);
    };
  }, []);
  const [editing, setEditing] = useState<string>();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<unknown>, message?: string) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      await changed(message);
      setEditing(undefined);
    } catch (error) {
      failed((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function editor(id: string) {
    return (
      <form
        className="folder-editor"
        onSubmit={(event) => {
          event.preventDefault();
          void run(
            () =>
              id === 'new'
                ? window.dextana.createFolder(name)
                : window.dextana.updateFolder(id, { name }),
            id === 'new' ? 'Folder created' : 'Folder renamed',
          );
        }}
      >
        <TextInput
          autoFocus
          aria-label="Folder name"
          placeholder="Folder name"
          className="folder-name-input"
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setEditing(undefined);
          }}
        />
        <div>
          <Button size="small" variant="secondary" disabled={busy || !name.trim()} type="submit">
            Save
          </Button>
          <Button size="small" variant="ghost" type="button" onClick={() => setEditing(undefined)}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }
  const ungrouped = activities.filter(
    (activity) => !folders.some((folder) => folder.id === activity.folderId),
  );
  return (
    <div className="workspace-folders" ref={root}>
      <div className="workspace-label">
        <span>WORKSPACE</span>
        <Button variant="layout"
          aria-label="New folder"
          title="New folder"
          onClick={() => {
            setEditing('new');
            setName('');
          }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </Button>
        <Select className="workspace-view" aria-label="Workspace view" title="Switch workspace view" value={view} onChange={event => onViewChange(event.target.value as 'activities' | 'cron' | 'desktop')}>
          <option value="activities">Activities</option><option value="cron">Scheduled jobs</option><option value="desktop">Desktop</option>
        </Select>
      </div>
      {editing === 'new' && editor('new')}
      <div className="folder-list">
        {folders.map((folder) => {
          const members = activities.filter((activity) => activity.folderId === folder.id);
          return (
            <section
              className="conversation-folder"
              key={folder.id}
              aria-label={`Folder ${folder.name}`}
            >
              <div className="folder-heading">
                <Button variant="layout"
                  className="folder-toggle"
                  aria-expanded={!folder.collapsed}
                  disabled={busy}
                  onClick={() => {
                    void run(() =>
                      window.dextana.updateFolder(folder.id, { collapsed: !folder.collapsed }),
                    );
                  }}
                >
                  <span aria-hidden="true">{folder.collapsed ? '▸' : '▾'}</span>
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M2 4V3h4l2 2h6v8H2V4Z"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="folder-name">{folder.name}</span>
                </Button>
                <Button variant="layout" className="folder-new-chat" aria-label={`New chat in ${folder.name}`} title="New chat" onClick={() => {
                  newChat(folder.id);
                  if (folder.collapsed) void run(() => window.dextana.updateFolder(folder.id, { collapsed: false }));
                }}><svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M7 3H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V9M9.5 3.5l3 3M6 10l1-3 5-5a1.4 1.4 0 0 1 2 2l-5 5-3 1Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg></Button>
                <details className="folder-menu">
                  <summary aria-label={`Manage folder ${folder.name}`} title="Manage folder">
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3" cy="8" r="1.2"/><circle cx="8" cy="8" r="1.2"/><circle cx="13" cy="8" r="1.2"/></svg>
                  </summary>
                  <div>
                    <Button variant="layout"
                      onClick={(event) => {
                        event.currentTarget.closest('details')?.removeAttribute('open');
                        setEditing(folder.id);
                        setName(folder.name);
                      }}
                    >
                      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m10 3 3 3M3 10l7-7a2.1 2.1 0 0 1 3 3l-7 7-4 1 1-4Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      <span>Rename folder</span>
                    </Button>
                    <Button variant="layout"
                      disabled={busy}
                      onClick={() => {
                        void run(
                          () => window.dextana.deleteFolder(folder.id),
                          'Folder removed. Chats moved to Ungrouped.',
                        );
                      }}
                    >
                      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.5 4.5h11M6 4V2.5h4V4M4 5l.5 8.5h7L12 5M6.5 7v4M9.5 7v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      <span>Remove folder</span>
                    </Button>
                  </div>
                </details>
              </div>
              {editing === folder.id && editor(folder.id)}
              {!folder.collapsed && (
                <div className="activity-list folder-activities">
                  {members.length ? (
                    members.map(renderActivity)
                  ) : (
                    <p className="folder-empty">
                      Create a new chat or move an existing conversation here.
                    </p>
                  )}
                </div>
              )}
            </section>
          );
        })}
        <div className="ungrouped-label">{folders.length ? 'Ungrouped' : 'Activities'}</div>
        <div className="activity-list">{ungrouped.map(renderActivity)}</div>
        {!activities.length && !folders.length && (
          <div className="sidebar-empty">Start an activity to get going.</div>
        )}
      </div>
    </div>
  );
}

export function FolderPicker({
  activity,
  folders,
  changed,
  failed,
}: Feedback & { activity: Activity; folders: ConversationFolder[] }) {
  const [busy, setBusy] = useState(false);
  return (
    <Select
      className="folder-picker"
      aria-label="Conversation folder"
      value={activity.folderId ?? ''}
      disabled={busy}
      onChange={(event) => {
        const folderId = event.target.value || null;
        setBusy(true);
        void window.dextana
          .moveActivity(activity.id, folderId)
          .then(() => changed('Conversation moved'))
          .catch((error) => failed(error.message))
          .finally(() => setBusy(false));
      }}
    >
      <option value="">Ungrouped</option>
      {folders.map((folder) => (
        <option key={folder.id} value={folder.id}>
          {folder.name}
        </option>
      ))}
    </Select>
  );
}
