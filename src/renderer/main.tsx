import { CronView } from './CronView';
import { BrowserPanel } from './BrowserPanel';
import { ContextPanel } from './ContextPanel';
import { ActivityFolders, FolderPicker } from './ActivityFolders';
import { displayTitle } from '../shared/titles';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ActivityMode, Settings, Snapshot } from '../shared/types';
import './style.css';
import { Transcript } from './Transcript';
import { ActivityView } from './ActivityView';
import { FusedSettings } from './FusedSettings';
import { MCPSettings } from './MCPSettings';

const settingsPages = {
  models: { title: 'Models', description: 'Connect Ollama and choose your default model.' },
  mcp: { title: 'MCP connections', description: 'Manage the tools and services your assistant can use.' },
};
function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [archiving, setArchiving] = useState(false);
  const [notice, setNotice] = useState<{ text: string; archivedId?: string }>();
  useEffect(() => {
    if (!notice || archiving) return;
    const timer = window.setTimeout(() => setNotice(undefined), 8000);
    return () => window.clearTimeout(timer);
  }, [notice, archiving]);
  const [workspaceView, setWorkspaceView] = useState<'activities' | 'cron'>('activities');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPage, setSettingsPage] = useState<keyof typeof settingsPages>('models');
  const [draft, setDraft] = useState<Settings>();
  const [model, setModel] = useState('');
  const [mode, setMode] = useState<ActivityMode>('work');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [draftFolderId, setDraftFolderId] = useState<string>();
  const [selectedId, setSelectedId] = useState<string>();
  useLayoutEffect(() => {
    // The rendered session is authoritative, including a fresh welcome screen.
    void window.dextana.selectActivity(settingsOpen || workspaceView === 'cron' ? undefined : selectedId);
  }, [selectedId, settingsOpen, workspaceView]);
  const currentSelection = useRef(selectedId);
  currentSelection.current = selectedId;
  const [prompt, setPrompt] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [followRequest, setFollowRequest] = useState(0);
  const [sending, setSending] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (!input.current) return;
    input.current.style.height = 'auto';
    input.current.style.height = `${Math.min(input.current.scrollHeight, 160)}px`;
  }, [prompt, selectedId, settingsOpen]);
  const activity = snapshot?.activities.find((a) => a.id === selectedId);
  useEffect(() => { setMode(activity?.mode ?? 'work'); }, [selectedId, activity?.mode]);
  const visibleActivities = snapshot?.activities.filter(item => !item.archived) ?? [];
  const running = activity && ['starting', 'running'].includes(activity.status);
  useEffect(() => window.dextana.subscribe(setSnapshot), []);
  const newActivity = (folderId?: string) => {
    setWorkspaceView('activities');
    setMode('work');
    setDraftFolderId(folderId);
    void window.dextana.selectActivity();
    setSelectedId(undefined);
    setSettingsOpen(false);
    setPrompt('');
    setAttachments([]);
    setModel(snapshot?.settings.defaultModel ?? '');
    setError('');
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'n') {
        event.preventDefault();
        newActivity();
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [snapshot?.settings.defaultModel]);
  async function archiveChat(id: string) {
    if (archiving) return;
    setArchiving(true);
    setError('');
    try {
      await window.dextana.archiveActivity(id, true);
      setSnapshot(await window.dextana.snapshot());
      if (currentSelection.current === id) newActivity();
      setNotice({ text: 'Chat archived', archivedId: id });
    } catch (failure) { setError((failure as Error).message); }
    finally { setArchiving(false); }
  }
  async function undoArchive(id: string) {
    if (archiving) return;
    setArchiving(true);
    try {
      await window.dextana.archiveActivity(id, false);
      setSnapshot(await window.dextana.snapshot());
      setNotice({ text: 'Chat restored' });
    } catch (failure) { setError((failure as Error).message); }
    finally { setArchiving(false); }
  }
  async function folderChanged(message?: string) {
    setSnapshot(await window.dextana.snapshot());
    setError('');
    if (message) setNotice({ text: message });
  }
  async function send() {
    if (!prompt.trim() || !model || sending) return;
    setSending(true);
    setFollowRequest(value => value + 1);
    setError('');
    try {
      const id = await window.dextana.start({ mode, prompt, model, files: attachments, activityId: selectedId, folderId: selectedId ? undefined : draftFolderId });
      setSelectedId(id);
      setPrompt('');
    setAttachments([]);
      setSnapshot(await window.dextana.snapshot());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }
  const composer = (
    <div className="composer">
      {!!attachments.length && <div className="attachments" role="region" aria-label="Attached files">{attachments.map(path => <span key={path} title={path}>{path.split('/').at(-1)} <button aria-label={`Remove attachment ${path.split('/').at(-1)}`} onClick={() => setAttachments(items => items.filter(item => item !== path))}>×</button></span>)}</div>}
      {!!activity?.queue?.length && <div className="message-queue" aria-label="Queued messages">
        <div className="queue-label">{running ? 'Queued' : 'Queue paused'} · {activity.queue.length}</div>
        {activity.queue.map((item, index) => <div className="queued-message" key={item.id}><span>{index + 1}.</span><p>{item.prompt}</p></div>)}
      </div>}
      <textarea
        ref={input}
        rows={1}
        aria-label="Describe your work"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void send();
          }
        }}
        placeholder="Describe the work you want to get done…"
      />
      <div className="composer-footer">
        <select className="activity-mode" aria-label="Activity mode" value={mode} onChange={event => setMode(event.target.value as ActivityMode)} disabled={sending}>
          <option value="work">Work</option>
          <option value="plan">Plan</option>
        </select>
        <button className="attach-files" aria-label="Attach files" title="Attach Excel, Word, PDF or text documents" disabled={sending} onClick={async () => {
          try { const paths = await window.dextana.pickFiles(); setAttachments(items => [...new Set([...items, ...paths])].slice(0, 20)); }
          catch (error) { setError((error as Error).message); }
        }}>＋ <span>Files</span></button>
        <select
          aria-label="Activity model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={running}
        >
          <option value="" disabled>
            Select an Ollama model
          </option>
          {snapshot?.settings.models.map((m) => (
            <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
          ))}
        </select>
        <button
          aria-label={running && !prompt.trim() ? 'Stop activity' : activity ? 'Send message' : 'Start activity'}
          className="send"
          data-state={running && !prompt.trim() ? 'stop' : 'send'}
          onClick={running && !prompt.trim() ? () => { void window.dextana.cancel(activity!.id).catch(e => setError(e.message)); } : send}
          disabled={sending || (!(running && !prompt.trim()) && (!model || !prompt.trim()))}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            {running && !prompt.trim()
              ? <rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor" />
              : <path d="M8 12V4m-3.5 3.5L8 4l3.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />}
          </svg>
        </button>
      </div>
      {mode === 'plan' && <p className="plan-mode-hint">{running && activity?.activePlanId ? 'Your approved plan is running. A follow-up will draft a new plan.' : 'Dextana will propose a plan and wait for your approval.'}</p>}
    </div>
  );
  useEffect(() => {
    window.dextana
      .snapshot()
      .then((value) => {
        setSnapshot(value);
        setModel(value.settings.defaultModel);
      })
      .catch((e) => setError(e.message));
  }, []);
  const openSettings = () => {
    if (settingsOpen) return;
    void window.dextana.selectActivity();
    setDraft(snapshot?.settings);
    setSettingsOpen(true);
    setSettingsPage('models');
    setError('');
    setConnected(false);
  };
  useEffect(() => window.dextana.onOpenSettings?.(openSettings), [snapshot, settingsOpen]);
  async function connect() {
    if (!draft) return;
    setBusy(true);
    setError('');
    try {
      const models = await window.dextana.models(draft.ollamaUrl);
      setDraft({
        ...draft,
        models,
        defaultModel: models.includes(draft.defaultModel) ? draft.defaultModel : (models[0] ?? ''),
      });
      setConnected(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!draft) return;
    try {
      await window.dextana.saveSettings(draft);
      setSnapshot(await window.dextana.snapshot());
      setModel(draft.defaultModel);
      setSettingsOpen(false);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className={snapshot?.browser && activity && !settingsOpen && workspaceView === 'activities' ? 'shell with-browser' : 'shell'}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">d</span>
          <strong>Dextana</strong>
          <span className="alpha">ALPHA</span>
        </div>
        {settingsOpen ? <>
          <button className="settings-back" onClick={() => {
            setSettingsOpen(false);
            setError('');
            void window.dextana.selectActivity(selectedId);
          }}>← Back to chats</button>
          <div className="settings-nav-title">Settings</div>
          <nav className="settings-nav" aria-label="Settings sections">
            {Object.entries(settingsPages).map(([id, page]) => (
              <button key={id} aria-current={settingsPage === id ? 'page' : undefined} onClick={() => {
                setSettingsPage(id as keyof typeof settingsPages);
                setError('');
              }}>{page.title}</button>
            ))}
          </nav>
        </> : <>
        <button aria-label="New activity" className="new-work" onClick={() => newActivity()}>
          <span>＋</span> New activity <kbd>⌘ N</kbd>
        </button>
        <ActivityFolders view={workspaceView} onViewChange={setWorkspaceView} newChat={newActivity} activities={visibleActivities} folders={snapshot?.folders ?? []} changed={folderChanged} failed={setError} renderActivity={a => (
<div className="activity-row" key={a.id}>
              <button
                aria-label={displayTitle(a.title)}
                className={a.id === selectedId && !settingsOpen ? 'activity-select active' : 'activity-select'}
                onClick={() => {
                  void window.dextana.selectActivity(a.id);
                  setWorkspaceView('activities');
                  setSelectedId(a.id);
                  setSettingsOpen(false);
                  setModel(a.model);
                  setPrompt('');
    setAttachments([]);
                  setError('');
                }}
              >
                <span className={`activity-dot ${a.approval ? 'needs-approval' : a.status}`} title={a.approval ? 'Needs approval' : undefined} />
                <span>{displayTitle(a.title)}</span>
              </button>
              <button className="activity-archive" aria-label={`Archive ${displayTitle(a.title)}`} title="Archive activity" disabled={archiving} onClick={() => { void archiveChat(a.id); }}>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 6v7h10V6M2 3h12v3H2zM6 9h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              </div>
        )}/>
        <div className="sidebar-bottom">
          <div className="local-status">
            <i /> Local workspace
          </div>
          <button aria-label="Settings" onClick={openSettings} className="settings-button">
            ⚙ <span>Settings</span>
            <span className="avatar">ME</span>
          </button>
        </div>
        </>}
      </aside>
      <main className={settingsOpen ? 'settings-main' : workspaceView === 'cron' ? 'cron-main' : activity ? 'conversation-main' : undefined}>
        <header>
          <span>
            Workspace <span className="slash">/</span>{' '}
            {settingsOpen ? `Settings / ${settingsPages[settingsPage].title}` : workspaceView === 'cron' ? 'Cron jobs' : (activity ? displayTitle(activity.title) : draftFolderId ? `New chat · ${snapshot?.folders?.find(folder => folder.id === draftFolderId)?.name ?? 'Workspace'}` : 'New activity')}
          </span>
          {activity && !settingsOpen && workspaceView === 'activities' ? <FolderPicker key={activity.id} activity={activity} folders={snapshot?.folders ?? []} changed={folderChanged} failed={setError}/> : <span className="privacy">◉ &nbsp; Yours by design</span>}
        </header>
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        {workspaceView === 'cron' && !settingsOpen && snapshot ? <CronView snapshot={snapshot} openActivity={id => { setSelectedId(id); setWorkspaceView('activities'); const run = snapshot.activities.find(a => a.id === id); if (run) setModel(run.model); setPrompt(''); setAttachments([]); }}/> : settingsOpen && draft ? (
          <div className="settings-scroll"><section className="settings-panel">
            <div className="eyebrow">SETTINGS</div>
            <h1>{settingsPages[settingsPage].title}</h1>
            <p className="muted">{settingsPages[settingsPage].description}</p>
            <div hidden={settingsPage !== 'models'}>
            <div className="settings-card">
              <h2>Ollama</h2>
              <p>Use the models installed on your Ollama server.</p>
              <label>
                Ollama address
                <input
                  value={draft.ollamaUrl}
                  onChange={(e) => {
                    setDraft({ ...draft, ollamaUrl: e.target.value, models: [], defaultModel: '' });
                    setConnected(false);
                  }}
                />
              </label>
              <button className="secondary" disabled={busy} onClick={connect}>
                {busy ? 'Connecting…' : 'Connect to Ollama'}
              </button>
              {connected && (
                <p role="status" className="success">
                  {draft.models.length
                    ? `${draft.models.length} models available`
                    : 'No models installed. Pull a model in Ollama, then reconnect.'}
                </p>
              )}
              <label>
                Default model
                <select
                  value={draft.defaultModel}
                  onChange={(e) => setDraft({ ...draft, defaultModel: e.target.value })}
                >
                  <option value="" disabled>
                    Choose a model
                  </option>
                  {draft.models.map((m) => (
                    <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
                  ))}
                </select>
              </label>
              <button className="primary" disabled={!draft.defaultModel || busy} onClick={save}>
                Save settings
              </button>
            </div>
            </div>
            <div hidden={settingsPage !== 'mcp'}>
              {snapshot && <MCPSettings workspace={snapshot.fusedWorkspace} connections={snapshot.mcpConnections ?? []} account={snapshot.fusedAccount} saved={async () => setSnapshot(await window.dextana.snapshot())} />}
            {!!snapshot?.fusedIntegrations?.length && (
              <FusedSettings
                integrations={snapshot.fusedIntegrations ?? []}
                saved={async () => {
                  setSnapshot(await window.dextana.snapshot());
                }}
              />
            )}
            </div>
          </section></div>
        ) : activity ? (
          <div className="conversation-layout"><div className="work-area">
            <Transcript key={activity.id} followRequest={followRequest}>
              <ActivityView
                activity={activity}
              />
            </Transcript>
            {composer}
          </div><ContextPanel key={activity.id} activity={activity} changed={async () => setSnapshot(await window.dextana.snapshot())} /></div>
        ) : (
          <section className="welcome">
            <div className="intro-mark">✳</div>
            <div className="eyebrow">LESS BUSYWORK. MORE MOMENTUM.</div>
            <h1>What are we working on?</h1>
            <p className="muted">A little direction. A lot taken care of.</p>
            {composer}
            {!snapshot?.settings.defaultModel && (
              <button className="connect-prompt" onClick={openSettings}>
                Connect Ollama to get started <span>↗</span>
              </button>
            )}
            <div className="suggestions">
              <div>
                <span>⌘</span>
                <strong>Put a process to work</strong>
                <p>Turn a repeated task into a clear workflow.</p>
              </div>
              <div>
                <span>◎</span>
                <strong>Bring the pieces together</strong>
                <p>Research, organize, and move work forward.</p>
              </div>
              <div>
                <span>↗</span>
                <strong>Work across your tools</strong>
                <p>Connect operations with optional Fused MCP.</p>
              </div>
            </div>
            <div className="welcome-note">Your models. Your workspace. Your next big thing.</div>
          </section>
        )}
        {notice && <div className="action-notice" role="status">
          <span>{notice.text}</span>
          {notice.archivedId && <button disabled={archiving} onClick={() => { void undoArchive(notice.archivedId!); }}>Undo</button>}
          <button aria-label="Dismiss notification" onClick={() => setNotice(undefined)}>×</button>
        </div>}
        <footer>
          <span className="footer-dot" /> Single owner · Local first{' '}
          <span>Built to do the work.</span>
        </footer>
      </main>
      {snapshot?.browser && activity && !settingsOpen && workspaceView === 'activities' && <BrowserPanel browser={snapshot.browser} activities={snapshot.activities} />}
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
