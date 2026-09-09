import { Badge, Button, Card, CheckboxField, EmptyState, PageHeader, Select, TextArea, TextInput, Icon } from './ui';
import './cron.css';
import { useState } from 'react';
import type { CronJobInput, Snapshot } from '../shared/types';

function localDateTime(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
}

export function CronView({ snapshot, openActivity }: { snapshot: Snapshot; openActivity: (id: string) => void }) {
  const [deferred, setDeferred] = useState(true);
  const [editing, setEditing] = useState<string>();
  const [draft, setDraft] = useState<CronJobInput>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function action(fn: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await fn(); } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  function newJob(deferred: boolean) {
    setEditing(undefined); setError('');
    setDraft({ name: '', prompt: '', model: snapshot.settings.models[0] || '',
      expression: deferred ? '' : '0 9 * * *', runAt: deferred ? new Date(Date.now() + 3600_000).toISOString() : null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, enabled: true });
  }
  const groups = [
    { title: 'Deferred tasks', description: 'Run once at a future time. Completed tasks are removed; their conversations stay.', deferred: true },
    { title: 'Recurring jobs', description: 'Repeat on a cron schedule. Jobs stay available for their next run.', deferred: false },
  ];
  return <section className="cron-view">
    <PageHeader title="Scheduled jobs" description="One-time tasks and recurring work." actions={<Button icon={<Icon name="plus" />} variant="primary" onClick={() => newJob(deferred)}>{deferred ? 'New deferred task' : 'New recurring job'}</Button>} />
    <p className="cron-note">Scheduled locally while Dextana is running and your computer is awake. Missed reminders appear overdue on return; missed agent work is skipped. Actions still ask for approval.</p>
    {(error || snapshot.cronError) && <p role="alert" className="error">{error || snapshot.cronError}</p>}
    <div className="cron-tabs" role="tablist" aria-label="Schedule type" onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? true : event.key === 'End' ? false : !deferred;
      setDeferred(next);
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next ? 0 : 1]?.focus();
    }}>{groups.map(group => <Button key={group.title} variant={deferred === group.deferred ? 'primary' : 'ghost'} id={group.deferred ? 'deferred-tab' : 'recurring-tab'} role="tab"
      aria-controls={group.deferred ? 'deferred-panel' : 'recurring-panel'} aria-selected={deferred === group.deferred}
      tabIndex={deferred === group.deferred ? 0 : -1} onClick={() => setDeferred(group.deferred)}>
      {group.title}<span aria-hidden="true">{(snapshot.cronJobs ?? []).filter(job => Boolean(job.runAt) === group.deferred).length}</span>
    </Button>)}</div>
    {draft && Boolean(draft.runAt) === deferred && <form className="cron-editor" onSubmit={event => { event.preventDefault(); void action(async () => { await window.dextana.saveCronJob(draft, editing); setDeferred(Boolean(draft.runAt)); setDraft(undefined); }); }}>
      <h2>{editing ? 'Edit' : 'New'} {draft.runAt ? 'deferred task' : 'recurring job'}</h2>
      <label>Job type<Select value={draft.runAt ? 'deferred' : 'recurring'} onChange={e => { setDeferred(e.target.value === 'deferred'); setDraft({ ...draft, runAt: e.target.value === 'deferred' ? new Date(Date.now() + 3600_000).toISOString() : null, expression: e.target.value === 'deferred' ? '' : '0 9 * * *' }); }}><option value="deferred">Deferred task · run once</option><option value="recurring">Recurring job · cron schedule</option></Select></label>
      <label>Job name<TextInput autoFocus value={draft.name} maxLength={80} required onChange={e => setDraft({ ...draft, name: e.target.value })}/></label>
      <label>Job instructions<TextArea value={draft.prompt} maxLength={32000} required rows={3} onChange={e => setDraft({ ...draft, prompt: e.target.value })}/></label>
      <div className="cron-fields">{!draft.runAt && <label>Schedule<Select value={['0 9 * * *', '0 9 * * 1-5', '0 * * * *'].includes(draft.expression) ? draft.expression : 'custom'} onChange={e => setDraft({ ...draft, expression: e.target.value === 'custom' ? '30 9 * * *' : e.target.value })}>
        <option value="0 9 * * *">Every day at 9:00</option><option value="0 9 * * 1-5">Weekdays at 9:00</option><option value="0 * * * *">Every hour</option><option value="custom">Custom cron</option>
      </Select></label>}<label>Time zone<TextInput required value={draft.timezone} onChange={e => setDraft({ ...draft, timezone: e.target.value })}/></label></div>
      <div className="cron-fields">{draft.runAt ? <label>Run at<TextInput type="datetime-local" step="1" required value={localDateTime(draft.runAt)} onChange={e => { if (e.target.value) setDraft({ ...draft, runAt: new Date(e.target.value).toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }); }}/><small>Shown in your computer’s local time.</small></label> : <label>Cron expression<TextInput required value={draft.expression} onChange={e => setDraft({ ...draft, expression: e.target.value })}/><small>minute · hour · day · month · weekday</small></label>}<label>Model<Select value={draft.model} required onChange={e => setDraft({ ...draft, model: e.target.value })}>{snapshot.settings.models.map(model => <option key={model}>{model}</option>)}</Select></label></div>
      <CheckboxField label="Enable this job" description="Run on this schedule while Dextana is open." checked={draft.enabled} disabled={busy} onChange={event => setDraft({ ...draft, enabled: event.target.checked })}/>
      <div className="cron-actions"><Button icon={<Icon name="check" />} type="submit" variant="primary" disabled={busy}>Save job</Button><Button icon={<Icon name="close" />} variant="secondary" type="button" disabled={busy} onClick={() => setDraft(undefined)}>Cancel</Button></div>
    </form>}
    {groups.map(group => <section className="cron-group" role="tabpanel" id={group.deferred ? 'deferred-panel' : 'recurring-panel'} aria-labelledby={group.deferred ? 'deferred-tab' : 'recurring-tab'} hidden={deferred !== group.deferred} key={group.title}>
      <p className="cron-note">{group.description}</p>
      <div className="cron-list">{(snapshot.cronJobs ?? []).filter(job => Boolean(job.runAt) === group.deferred).map(job => <Card as="article" className="cron-card" aria-label={job.name} key={job.id}>
      <div className="cron-heading"><h3>{job.name}</h3><Badge tone={job.enabled ? 'success' : 'neutral'}>{job.enabled ? 'Scheduled' : job.runAt && job.runs.some(run => run.status === 'completed') ? 'Completed' : 'Paused'}</Badge></div>
      <p className="cron-prompt">{job.prompt}</p>
      <p className="cron-meta">{job.runAt ? <>Once · {new Date(job.runAt).toLocaleString(undefined, { timeZone: job.timezone })}</> : <code>{job.expression}</code>} · {job.timezone} · {job.kind === 'reminder' ? 'Reminder in chat' : job.model}</p>
      {job.enabled && job.nextRunAt && <p className="cron-meta">Next run · {new Date(job.nextRunAt).toLocaleString(undefined, { timeZone: job.timezone })}</p>}
      {job.error && <p role="status">{job.error}</p>}
      <div className="cron-actions"><Button icon={<Icon name="play" />} variant="secondary" disabled={busy} onClick={() => void action(() => window.dextana.runCronJob(job.id))}>Run now</Button><Button icon={<Icon name="pause" />} variant="secondary" disabled={busy} onClick={() => void action(() => window.dextana.saveCronJob({ ...job, enabled: !job.enabled }, job.id))}>{job.enabled ? 'Pause' : 'Resume'}</Button><Button icon={<Icon name="edit" />} variant="secondary" disabled={busy} onClick={() => { setEditing(job.id); setDraft({ ...job }); setError(''); }}>Edit</Button><Button icon={<Icon name="trash" />} variant="danger" disabled={busy} onClick={() => void action(async () => { await window.dextana.removeCronJob(job.id); if (editing === job.id) setDraft(undefined); })}>Delete</Button></div>
      {!!job.runs.length && <details className="cron-history" open><summary>Recent runs</summary>{job.runs.map(run => {
        const activity = snapshot.activities.find(a => a.id === run.activityId);
        const label = `${new Date(run.startedAt).toLocaleString()} · ${activity?.approval ? 'Needs approval' : activity?.status ?? run.status ?? (run.error ? 'Failed' : 'Starting')}`;
        return <div key={run.id}>{activity ? <Button variant="ghost" size="small" onClick={() => openActivity(activity.id)}>{label}</Button> : <span>{label}</span>}{run.error && <p>{run.error}</p>}</div>;
      })}</details>}
    </Card>)}</div>
      {!(snapshot.cronJobs ?? []).some(job => Boolean(job.runAt) === group.deferred) && <EmptyState title={group.deferred ? 'No deferred tasks' : 'No recurring jobs'} description={group.deferred ? 'Schedule a one-time task or ask for a reminder in chat.' : 'Schedule daily summaries, weekly reviews, or routine checks.'} />}
    </section>)}
  </section>;
}
