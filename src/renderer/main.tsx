import { MessageQueue } from './MessageQueue';
import { IntegrationsSettings } from './IntegrationsSettings';
import { UserBrowserButton, UserBrowserStatus } from './UserBrowser';
import { BrowserUseSettings } from './BrowserUseSettings';
import { BackgroundServiceSettings } from './BackgroundServiceSettings';
import { ComputerUseStatus, ComputerUseSettings } from './DesktopComputer';
import { Button, Field, FormSection, PageHeader, Select, Tagline, TextInput, TextArea, Icon } from './ui';
import { SkillsSettings } from './SkillsSettings';
import { UsageSettings } from './UsageSettings';
import { ImageInterpreterSettings } from './ImageInterpreterSettings';
import { ModelAuthSettings, parsedAuth, type AuthDraft } from './ModelAuthSettings';
import { MemorySettings } from './MemorySettings';
import { NotificationCenter } from './NotificationCenter';
import { SettingsIcon } from './SettingsIcon';
import { isChatModel } from '../shared/chat-models';
import { ShowBrowser } from './ShowBrowser';
import { SessionSettings } from './SessionSettings';
import { AppearanceSettings } from './AppearanceSettings';
import { ModelSelector } from './ModelSelector';
import { CronView } from './CronView';
import { DesktopWorkspace, type DesktopView } from './DesktopWorkspace';
import { BrowserPanel } from './BrowserPanel';
import { ContextPanel } from './ContextPanel';
import { ActivityFolders, FolderPicker } from './ActivityFolders';
import { displayTitle } from '../shared/titles';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Reasoning, ActivityMode, Settings, Snapshot } from '../shared/types';
import './ui/tokens.css';
import './style.css';
import './theme.css';
import './settings.css';
import './rich-content.css';
import './ContextPanel.css';
import './review-cards.css';
import './ui/components.css';
import { Transcript } from './Transcript';
import { ActivityView } from './ActivityView';
import { CompactionStatus } from './CompactionStatus';
import { FusedSettings } from './FusedSettings';
import { MCPSettings } from './MCPSettings';

const appLogo = new URL('../../assets/icon.svg', import.meta.url).href;

const settingsPages = {
  integrations: { title: 'Integrations', description: 'Explore supported apps, connect your accounts and manage your Dext Integrations subscription.' },
  computer: { title: 'Computer use', description: 'Configure app control, system permissions and the window a chat can use.' },
  browser: { title: 'Browser use', description: 'Set global browser defaults and individual chat overrides.' },
  background: { title: 'Background service', description: 'Choose how Dextana runs when you close its window.' },
  appearance: { icon: 'M10 2a8 8 0 1 0 8 8c0-1.5-1.5-2-3-2h-2a2 2 0 0 1-2-2c0-1 1-2 1-3 0-.7-1-1-2-1Z M6 6h.01 M4.5 10h.01 M7 14h.01', title: 'Appearance', description: 'Make Dextana feel at home on your desktop.' },
  models: { icon: 'M6 5h8a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z M8 8h4v4H8Z M7 2v3m6-3v3M7 15v3m6-3v3M2 7h3m-3 6h3m10-6h3m-3 6h3', title: 'Models', description: 'Connect Ollama or an OpenAI-compatible model provider.' },
  usage: { title: 'Usage', description: 'Understand how your models are being used.' },
  skills: { title: 'Skills', description: 'Reusable instructions for the way you work.' },
  mcp: { icon: 'M7 2v4m6-4v4M5 6h10v3a5 5 0 0 1-10 0V6Z M10 14v4', title: 'Connectors', description: 'Manage the tools and services your assistant can use.' },
};
function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = snapshot?.theme ?? 'system';
  }, [snapshot?.theme]);
  const [archiving, setArchiving] = useState(false);
  const [notice, setNotice] = useState<{ text: string; archivedId?: string }>();
  useEffect(() => {
    if (!notice || archiving) return;
    const timer = window.setTimeout(() => setNotice(undefined), 8000);
    return () => window.clearTimeout(timer);
  }, [notice, archiving]);
  const [selectedDesktopResource, setSelectedDesktopResource] = useState<string>();
  const [workspaceView, setWorkspaceView] = useState<'activities' | 'cron' | 'desktop'>('activities');
  const [desktopView, setDesktopView] = useState<DesktopView>('time');
  const [contextHidden, setContextHidden] = useState(false);
  const [settingsSearch, setSettingsSearch] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPage, setSettingsPage] = useState<keyof typeof settingsPages>('models');
  const [draft, setDraft] = useState<Settings>();
  const [apiKey, setApiKey] = useState<string | undefined>();
  const [manualModel, setManualModel] = useState('');
  const [embeddingModels, setEmbeddingModels] = useState<string[]>();
  const [visionModels, setVisionModels] = useState<string[]>();
  const [authDraft, setAuthDraft] = useState<AuthDraft>();
  const [model, setModel] = useState('');
  const [reasoning, setReasoning] = useState<Reasoning>('default');
  const [mode, setMode] = useState<ActivityMode>('work');
  const [error, setError] = useState('');
  const [steering, setSteering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [draftFolderId, setDraftFolderId] = useState<string>();
  const [selectedId, setSelectedId] = useState<string>();
  useLayoutEffect(() => {
    // The rendered session is authoritative, including a fresh welcome screen.
    void window.dextana.selectActivity(settingsOpen || workspaceView !== 'activities' ? undefined : selectedId);
  }, [selectedId, settingsOpen, workspaceView]);
  useLayoutEffect(() => {
    const view = settingsOpen ? undefined : workspaceView === 'desktop'
      ? { page: desktopView }
      : workspaceView === 'activities'
        ? { page: 'chat', target: selectedId ? { kind: 'activity' as const, activityId: selectedId } : undefined }
        : { page: workspaceView };
    void window.dextana.notification({ action: 'view', view }).catch(failure => setError(failure.message));
  }, [selectedId, settingsOpen, workspaceView, desktopView]);
  useEffect(() => window.dextana.onOpenActivity(id => {
    setSelectedId(id); setWorkspaceView('activities'); setSettingsOpen(false);
  }), []);
  useEffect(() => window.dextana.onOpenDesktop(id => {
    if (id && id === snapshot?.desktopComputer?.selection?.id) { openSettings('computer'); return; }
    setSelectedDesktopResource(id); setWorkspaceView('desktop'); setSettingsOpen(false);
  }), [snapshot, settingsOpen]);
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
  useEffect(() => { if (activity) { setModel(snapshot?.settings.models.includes(activity.modelSelection?.model ?? activity.model) ? (activity.modelSelection?.model ?? activity.model) : ''); setReasoning(activity.modelSelection?.reasoning ?? activity.reasoning ?? 'default'); } }, [selectedId]);
  const visibleActivities = snapshot?.activities.filter(item => !item.archived) ?? [];
  const running = activity && ['starting', 'running'].includes(activity.status);
  useEffect(() => window.dextana.subscribe(setSnapshot), []);
  const newActivity = (folderId?: string) => {
    setWorkspaceView('activities');
    setMode('work');
    setReasoning('default');
    setDraftFolderId(folderId);
    void window.dextana.selectActivity();
    setSelectedId(undefined);
    setSettingsOpen(false);
    setPrompt('');
    setAttachments([]);
    setModel(snapshot?.settings.models[0] ?? '');
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
  }, [snapshot?.settings.models]);
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
      const id = await window.dextana.start({ mode, prompt, model, reasoning, files: attachments, activityId: selectedId, folderId: selectedId ? undefined : draftFolderId });
      setSelectedId(id);
      // The composer stays editable while IPC saves the submitted message.
      // Preserve any new draft or attachments entered before it acknowledges.
      setPrompt(current => current === prompt ? '' : current);
      setAttachments(current => current === attachments ? [] : current);
      setSnapshot(await window.dextana.snapshot());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }
  const selectionSave = useRef(Promise.resolve());
  function persistSelection(nextModel: string, nextReasoning: Reasoning) {
    if (!selectedId) return;
    const id = selectedId;
    selectionSave.current = selectionSave.current.catch(() => {}).then(() => window.dextana.selectModel(id, nextModel, nextReasoning)).catch(error => setError(error.message));
  }
  const canResume = activity?.status === 'cancelled' && !prompt.trim();
  async function resume() {
    if (!activity || sending) return;
    setSending(true);
    setError('');
    try { await window.dextana.resume(activity.id); setFollowRequest(value => value + 1); }
    catch (error) { setError((error as Error).message); }
    finally { setSending(false); }
  }
  const composer = (
    <div className="composer">
      <CompactionStatus activity={activity} />
      {!!attachments.length && <div className="attachments" role="region" aria-label="Attached files">{attachments.map(path => <span key={path} title={path}>{path.split(/[\\/]/).at(-1)} <Button variant="layout" aria-label={`Remove attachment ${path.split(/[\\/]/).at(-1)}`} onClick={() => setAttachments(items => items.filter(item => item !== path))}>×</Button></span>)}</div>}
      {activity && <MessageQueue key={activity.id} activityId={activity.id} items={activity.queue ?? []}
        running={!!running} disabled={steering || sending || !!activity.archived || !!activity.parentId}
        failed={setError} steer={messageId => {
          setSteering(true);
          setError('');
          void window.dextana.steer(activity.id, messageId)
            .then(() => { setFollowRequest(value => value + 1); })
            .catch(error => setError(error.message))
            .finally(() => setSteering(false));
        }} />}
      <TextArea
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
        placeholder={mode === 'plan' ? 'What would you like to plan?' : 'Describe the work you want to get done…'}
      />
      <div className="composer-footer">
        <Select className="activity-mode" title={mode === 'plan' ? 'Draft a plan for your approval before taking action' : 'Take action on your request'} aria-label="Activity mode" value={mode} onChange={event => setMode(event.target.value as ActivityMode)} disabled={sending}>
          <option value="work">Work</option>
          <option value="plan">Plan</option>
        </Select>
        <Button variant="layout" className="attach-files" aria-label="Attach files" title="Attach documents, PDFs, spreadsheets or images" disabled={sending} onClick={async () => {
          try { const paths = await window.dextana.pickFiles(); setAttachments(items => [...new Set([...items, ...paths])].slice(0, 20)); }
          catch (error) { setError((error as Error).message); }
        }}><svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 2.5h6l4 4v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1Z"/><path d="M12 2.5v4h4M8 10h5M8 13h5"/></svg><span>Files</span></Button>
        <ModelSelector key={`${snapshot?.settings.provider}:${snapshot?.settings.connectionId}`} models={snapshot?.settings.models ?? []} model={model} reasoning={reasoning} url={snapshot?.settings.ollamaUrl ?? ''} disabled={sending} changeModel={value => { setModel(value); setReasoning('default'); persistSelection(value, 'default'); }} changeReasoning={value => { setReasoning(value); persistSelection(model, value); }} />
        <Button variant="layout"
          aria-label={canResume ? 'Resume activity' : running && !prompt.trim() ? 'Stop activity' : activity ? 'Send message' : 'Start activity'}
          className="send"
          data-state={canResume ? 'resume' : running && !prompt.trim() ? 'stop' : 'send'}
          title={canResume ? 'Resume activity' : running && !prompt.trim() ? 'Stop and pause activity' : undefined}
          onClick={canResume ? resume : running && !prompt.trim() ? () => { void window.dextana.cancel(activity!.id).catch(e => setError(e.message)); } : send}
          disabled={sending || steering || (!canResume && !(running && !prompt.trim()) && (!model || !snapshot?.settings.models.includes(model) || !prompt.trim()))}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            {canResume ? <path d="M5 3.5 12 8l-7 4.5Z" fill="currentColor" /> : running && !prompt.trim()
              ? <rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor" />
              : <path d="M8 12V4m-3.5 3.5L8 4l3.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />}
          </svg>
        </Button>
      </div>
    </div>
  );
  useEffect(() => {
    window.dextana
      .snapshot()
      .then((value) => {
        setSnapshot(value);
        setModel(value.settings.models[0] ?? '');
      })
      .catch((e) => setError(e.message));
  }, []);
  const openSettings = (page: keyof typeof settingsPages = 'models') => {
    if (settingsOpen) { setSettingsPage(page); setSettingsSearch(''); return; }
    void window.dextana.selectActivity();
    setDraft(snapshot?.settings);
    setEmbeddingModels(undefined); setVisionModels(undefined);
    setSettingsOpen(true);
    setSettingsPage(page);
    setSettingsSearch('');
    setApiKey(undefined);
    setAuthDraft(undefined);
    setManualModel('');
    setError('');
    setConnected(false);
  };
  useEffect(() => window.dextana.onOpenSettings?.(() => openSettings()), [snapshot, settingsOpen]);
  async function connect() {
    if (!draft) return;
    setBusy(true);
    setError('');
    try {
      const catalog = await window.dextana.modelCatalog(draft, apiKey, parsedAuth(authDraft));
      if (!Array.isArray(catalog.vision)) {
        throw new Error('Restart Dextana to finish updating model discovery, then connect again to load image interpreter models.');
      }
      setEmbeddingModels(catalog.embedding);
      setVisionModels(catalog.vision);
      setDraft({
        ...draft,
        models: catalog.chat,
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
    setBusy(true);
    try {
      await window.dextana.saveSettings(draft, apiKey, parsedAuth(authDraft));
      const saved = await window.dextana.snapshot();
      setSnapshot(saved);
      setDraft(saved.settings);
      if (!draft.models.includes(model)) setModel(draft.models[0] ?? '');
      if (!saved.settings.memoryError) setSettingsOpen(false);
      setApiKey(undefined);
      setAuthDraft(undefined);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={settingsOpen ? 'shell settings-shell' : snapshot?.browser && activity && workspaceView === 'activities' ? 'shell with-browser' : 'shell'}>
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-mark" src={appLogo} alt="Dext" />
          <strong>Dextana</strong>
          <span className="alpha">ALPHA</span>
        </div>
        {settingsOpen ? <>
          <Button variant="layout" className="settings-back" onClick={() => {
            setSettingsOpen(false);
            setError('');
            void window.dextana.selectActivity(selectedId);
          }}>← Back to chats</Button>
          <TextInput className="settings-search" aria-label="Search settings" placeholder="Search settings" value={settingsSearch} onChange={event => setSettingsSearch(event.target.value)}/>
          <nav className="settings-nav" aria-label="Settings sections">
            {([['Preferences', ['appearance', 'models', 'usage']], ['Customize', ['skills', 'integrations', 'mcp']], ['Automation', ['computer', 'browser', 'background']]] as const).map(([group, ids]) => {
              const matches = ids.filter(id => (settingsPages[id].title + ' ' + settingsPages[id].description).toLowerCase().includes(settingsSearch.toLowerCase()));
              return !!matches.length && <div className="settings-nav-group" key={group}><div className="settings-nav-title">{group}</div>{matches.map(id => <Button variant="layout" key={id} aria-current={settingsPage === id ? 'page' : undefined} onClick={() => { setSettingsPage(id); setError(''); }}><SettingsIcon name={id}/>{settingsPages[id].title}</Button>)}</div>;
            })}
            {!Object.values(settingsPages).some(page => (page.title + ' ' + page.description).toLowerCase().includes(settingsSearch.toLowerCase())) && <p className="settings-caption">No matching settings</p>}
          </nav>
        </> : <>
        <Button variant="layout" aria-label="New activity" className="new-work" onClick={() => newActivity()}>
          <span>＋</span> New activity <kbd>⌘ N</kbd>
        </Button>
        <ActivityFolders view={workspaceView} onViewChange={setWorkspaceView} newChat={newActivity} activities={visibleActivities} folders={snapshot?.folders ?? []} changed={folderChanged} failed={setError} renderActivity={a => (
<div className="activity-row" key={a.id}>
              <Button variant="layout"
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
              </Button>
              <Button variant="layout" className="activity-archive" aria-label={`Archive ${displayTitle(a.title)}`} title="Archive activity" disabled={archiving} onClick={() => { void archiveChat(a.id); }}>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 6v7h10V6M2 3h12v3H2zM6 9h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Button>
              </div>
        )}/>
        <div className="sidebar-bottom">
          <div className="local-status">
            <i /> Local workspace
          </div>
          <Button variant="layout" aria-label="Settings" onClick={() => openSettings()} className="settings-button">
            ⚙ <span>Settings</span>
            <span className="avatar">ME</span>
          </Button>
        </div>
        </>}
      </aside>
      <main className={settingsOpen ? 'settings-main' : workspaceView !== 'activities' ? 'cron-main' : activity ? 'conversation-main' : undefined}>
        <header>
          <span className="session-heading"><span className="session-name">
            Workspace <span className="slash">/</span>{' '}
            {settingsOpen ? `Settings / ${settingsPages[settingsPage].title}` : workspaceView === 'cron' ? 'Scheduled jobs' : workspaceView === 'desktop' ? 'Desktop' : (activity ? displayTitle(activity.title) : draftFolderId ? `New chat · ${snapshot?.folders?.find(folder => folder.id === draftFolderId)?.name ?? 'Workspace'}` : 'New activity')}
          </span>
          </span>
          {activity && !settingsOpen && workspaceView === 'activities' ? <div className="chat-header-actions"><UserBrowserButton key={`user-${activity.id}`} activityId={activity.id} state={snapshot?.userBrowsers?.find(state => state.activityId === activity.id)} failed={setError} /><ShowBrowser key={activity.id} activity={activity} failed={setError} /><SessionSettings key={activity.id} activity={activity} browserAutoAllow={snapshot?.browserPreferences?.autoAllow === true} showContext={!contextHidden} toggleContext={() => setContextHidden(value => !value)} folderControl={<FolderPicker activity={activity} folders={snapshot?.folders ?? []} changed={folderChanged} failed={setError}/>} /></div> : <span className="privacy">◉ &nbsp; Yours by design</span>}
          <NotificationCenter items={snapshot?.notifications} />
          {settingsOpen && <Button variant="layout" className="settings-close" aria-label="Close settings" onClick={() => { setSettingsOpen(false); setApiKey(undefined); setError(''); }}>×</Button>}
        </header>
        <UserBrowserStatus state={snapshot?.userBrowsers?.find(state => state.activityId === activity?.id)} failed={setError} />
        <ComputerUseStatus snapshot={snapshot?.desktopComputer} failed={setError} />
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        {workspaceView === 'desktop' && !settingsOpen && snapshot ? <DesktopWorkspace view={desktopView} setView={setDesktopView} close={() => setWorkspaceView('activities')} snapshot={snapshot} focusedResource={selectedDesktopResource} openActivity={id => { setSelectedId(id); setWorkspaceView('activities'); }} /> : workspaceView === 'cron' && !settingsOpen && snapshot ? <CronView snapshot={snapshot} openActivity={id => { setSelectedId(id); setWorkspaceView('activities'); const run = snapshot.activities.find(a => a.id === id); if (run) setModel(run.model); setPrompt(''); setAttachments([]); }}/> : settingsOpen && draft ? (
          <div className="settings-scroll"><section className="settings-panel">
            <PageHeader title={settingsPages[settingsPage].title} description={settingsPages[settingsPage].description} />
            {settingsPage === 'computer' && snapshot && <ComputerUseSettings snapshot={snapshot.desktopComputer ?? { enabled: false }} activities={snapshot.activities} openActivity={id => { setSelectedId(id); setWorkspaceView('activities'); setSettingsOpen(false); }} />}
            {settingsPage === 'integrations' && <IntegrationsSettings />}
            {settingsPage === 'browser' && snapshot && <BrowserUseSettings defaultAutoAllow={snapshot.browserPreferences?.autoAllow === true} activities={snapshot.activities} selectedId={selectedId} openActivity={id => { setSelectedId(id); setWorkspaceView('activities'); setSettingsOpen(false); }} />}
            {settingsPage === 'background' && <BackgroundServiceSettings enabled={snapshot?.desktopBackground !== false} />}
            {settingsPage === 'skills' && <SkillsSettings/>}
            {settingsPage === 'usage' && <UsageSettings/>}
            {settingsPage === 'appearance' && <AppearanceSettings theme={snapshot?.theme ?? 'system'} saved={async () => setSnapshot(await window.dextana.snapshot())} />}
            <div hidden={settingsPage !== 'models'}>
            <FormSection className="model-settings-form" aria-label="Model connection">
              <Field variant="card" label="Provider" hint={draft.provider === 'openai' ? 'Use OpenRouter or another compatible chat-completions endpoint.' : 'Use the models installed on your Ollama server.'}>
                {props => <Select {...props} value={draft.provider ?? 'ollama'} disabled={busy} onChange={e => {
                  const provider = e.target.value as 'ollama' | 'openai';
                  setDraft({ provider, ollamaUrl: provider === 'ollama' ? 'http://127.0.0.1:11434' : 'https://openrouter.ai/api/v1', models: [] });
                  setApiKey(undefined); setAuthDraft(undefined); setManualModel(''); setConnected(false); setEmbeddingModels(undefined); setVisionModels(undefined);
                }}>
                  <option value="ollama">Ollama</option>
                  <option value="openai">OpenAI-compatible</option>
                </Select>}
              </Field>
              <Field variant="card" label={draft.provider === 'openai' ? 'Base URL' : 'Ollama address'} hint="Where Dextana connects to your models.">
                {props => <TextInput {...props} disabled={busy} value={draft.ollamaUrl} onChange={e => {
                  setDraft({ ...draft, ollamaUrl: e.target.value, models: [], imageInterpreterModel: undefined, embeddingModel: undefined, embeddingDimensions: undefined, memoryError: undefined, authMode: undefined, hasCustomAuth: undefined });
                  setApiKey(undefined); setAuthDraft(undefined); setConnected(false); setEmbeddingModels(undefined); setVisionModels(undefined);
                }} />}
              </Field>
              {draft.provider === 'openai' && <>
                <ModelAuthSettings key={`auth:${draft.provider}:${draft.ollamaUrl}`} settings={draft} draft={authDraft} disabled={busy} change={value => { setAuthDraft(value); setConnected(false); setEmbeddingModels(undefined); setVisionModels(undefined); }} />
                <Field label="API key">
                  {props => <TextInput {...props} type="password" autoComplete="off" disabled={busy} value={apiKey ?? ''}
                    placeholder={snapshot?.settings.hasApiKey && snapshot.settings.ollamaUrl === draft.ollamaUrl ? 'Saved securely — leave blank to keep' : 'Optional for endpoints without authentication'}
                    onChange={e => { setApiKey(e.target.value || undefined); setEmbeddingModels(undefined); setVisionModels(undefined); }} />}
                </Field>
                {snapshot?.settings.hasApiKey && <div className="dx-actions"><Button icon={<Icon name="trash" />} variant="ghost" size="small" disabled={busy} onClick={() => setApiKey('')}>{apiKey === '' ? 'Key will be removed on save' : 'Remove saved key'}</Button></div>}
              </>}
              <div className="dx-actions">
                <Button icon={<Icon name="refresh" />} variant="secondary" disabled={busy} onClick={connect}>
                  {busy ? 'Connecting…' : draft.provider === 'openai' ? 'Fetch models' : 'Connect to Ollama'}
                </Button>
                {connected && <span role="status" className="settings-caption">{draft.models.length ? `${draft.models.length} models available` : 'No chat models available.'}</span>}
              </div>
              {draft.provider === 'openai' && <div className="model-manual-entry">
                <Field label="Model ID">
                  {props => <TextInput {...props} value={manualModel} disabled={busy} placeholder="Or enter a chat model ID manually" onChange={e => setManualModel(e.target.value)} />}
                </Field>
                <Button icon={<Icon name="plus" />} variant="secondary" disabled={busy || !manualModel.trim()} onClick={() => {
                  if (!isChatModel({ id: manualModel.trim() })) { setError('Choose a chat model. Embedding and reranking models are not supported.'); return; }
                  setDraft({ ...draft, models: [...new Set([...draft.models, manualModel.trim()])] }); setManualModel(''); setConnected(true);
                }}>Add model</Button>
              </div>}
              <ImageInterpreterSettings key={`image:${draft.provider}:${draft.ollamaUrl}`} settings={draft} models={visionModels} disabled={busy} change={setDraft} />
              <MemorySettings key={`${draft.provider}:${draft.ollamaUrl}`} settings={draft} models={embeddingModels} disabled={busy} change={setDraft} />
              <div className="dx-form-actions">
                <Button icon={<Icon name="check" />} variant="primary" disabled={!draft.models.length || busy} onClick={save}>Save settings</Button>
              </div>
            </FormSection>
            </div>
            <div hidden={settingsPage !== 'mcp'}>
              {snapshot && <MCPSettings workspace={snapshot.fusedWorkspace} connections={snapshot.mcpConnections ?? []} account={snapshot.fusedAccount} saved={async () => setSnapshot(await window.dextana.snapshot())} />}
            {!!snapshot?.fusedIntegrations?.length && (
              <FusedSettings
                integrations={(snapshot.fusedIntegrations ?? []).filter(integration => !integration.managed)}
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
                edited={() => setFollowRequest(value => value + 1)}
              />
            </Transcript>
            {composer}
          </div><ContextPanel key={activity.id} minimize={() => setContextHidden(true)} hidden={contextHidden} activity={activity} changed={async () => setSnapshot(await window.dextana.snapshot())} /></div>
        ) : (
          <section className="welcome">
            <img className="intro-mark" src={appLogo} alt="Dext" />
            <Tagline className="eyebrow">LESS BUSYWORK. MORE MOMENTUM.</Tagline>
            <h1>What are we working on?</h1>
            <p className="muted">A little direction. A lot taken care of.</p>
            {composer}
            {!snapshot?.settings.models.length && (
              <Button icon={<Icon name="plug" />} variant="layout" className="connect-prompt" onClick={() => openSettings()}>
                Connect a model to get started <span>↗</span>
              </Button>
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
          {notice.archivedId && <Button variant="layout" disabled={archiving} onClick={() => { void undoArchive(notice.archivedId!); }}>Undo</Button>}
          <Button variant="layout" aria-label="Dismiss notification" onClick={() => setNotice(undefined)}>×</Button>
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
