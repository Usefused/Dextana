import { Badge, Button, Card, CheckboxField, EmptyState, PageHeader, Select, TextArea, TextInput, Icon } from './ui';
import './cron.css';
import { useState } from 'react';
import type { CronJobInput, Snapshot } from '../shared/types';

export function CronView({ snapshot, openActivity }: { snapshot: Snapshot; openActivity: (id: string) => void }) {
  const [editing, setEditing] = useState<string>();
  const [draft, setDraft] = useState<CronJobInput>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function action(fn: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await fn(); } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="cron-view">
    <PageHeader title="Scheduled jobs" description="Recurring work, on your schedule." actions={<Button icon={<Icon name="plus" />} variant="primary" onClick={() => {
      setEditing(undefined); setError(''); setDraft({ name: '', prompt: '', model: snapshot.settings.models[0] || '', expression: '0 9 * * *', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, enabled: true });
    }}>New job</Button>} />
    <p className="cron-note">Scheduled by your local backend while Dextana is open and your computer is awake. Missed runs are skipped. Actions still ask for approval.</p>
    {(error || snapshot.cronError) && <p role="alert" className="error">{error || snapshot.cronError}</p>}
    {draft && <form className="cron-editor" onSubmit={event => { event.preventDefault(); void action(async () => { await window.dextana.saveCronJob(draft, editing); setDraft(undefined); }); }}>
      <h2>{editing ? 'Edit job' : 'New scheduled job'}</h2>
      <label>Job name<TextInput autoFocus value={draft.name} maxLength={80} required onChange={e => setDraft({ ...draft, name: e.target.value })}/></label>
      <label>Job instructions<TextArea value={draft.prompt} maxLength={32000} required rows={3} onChange={e => setDraft({ ...draft, prompt: e.target.value })}/></label>
      <div className="cron-fields"><label>Schedule<Select value={['0 9 * * *', '0 9 * * 1-5', '0 * * * *'].includes(draft.expression) ? draft.expression : 'custom'} onChange={e => setDraft({ ...draft, expression: e.target.value === 'custom' ? '30 9 * * *' : e.target.value })}>
        <option value="0 9 * * *">Every day at 9:00</option><option value="0 9 * * 1-5">Weekdays at 9:00</option><option value="0 * * * *">Every hour</option><option value="custom">Custom cron</option>
      </Select></label><label>Time zone<TextInput required value={draft.timezone} onChange={e => setDraft({ ...draft, timezone: e.target.value })}/></label></div>
      <div className="cron-fields"><label>Cron expression<TextInput required value={draft.expression} onChange={e => setDraft({ ...draft, expression: e.target.value })}/><small>minute · hour · day · month · weekday</small></label><label>Model<Select value={draft.model} required onChange={e => setDraft({ ...draft, model: e.target.value })}>{snapshot.settings.models.map(model => <option key={model}>{model}</option>)}</Select></label></div>
      <CheckboxField label="Enable this job" description="Run on this schedule while Dextana is open." checked={draft.enabled} disabled={busy} onChange={event => setDraft({ ...draft, enabled: event.target.checked })}/>
      <div className="cron-actions"><Button icon={<Icon name="check" />} type="submit" variant="primary" disabled={busy}>Save job</Button><Button icon={<Icon name="close" />} variant="secondary" type="button" disabled={busy} onClick={() => setDraft(undefined)}>Cancel</Button></div>
    </form>}
    <div className="cron-list">{(snapshot.cronJobs ?? []).map(job => <Card as="article" className="cron-card" aria-label={job.name} key={job.id}>
      <div className="cron-heading"><h2>{job.name}</h2><Badge tone={job.enabled ? 'success' : 'neutral'}>{job.enabled ? 'Scheduled' : 'Paused'}</Badge></div>
      <p className="cron-prompt">{job.prompt}</p>
      <p className="cron-meta"><code>{job.expression}</code> · {job.timezone} · {job.model}</p>
      {job.enabled && job.nextRunAt && <p className="cron-meta">Next run · {new Date(job.nextRunAt).toLocaleString(undefined, { timeZone: job.timezone })}</p>}
      {job.error && <p role="status">{job.error}</p>}
      <div className="cron-actions"><Button icon={<Icon name="play" />} variant="secondary" disabled={busy} onClick={() => void action(() => window.dextana.runCronJob(job.id))}>Run now</Button><Button icon={<Icon name="pause" />} variant="secondary" disabled={busy} onClick={() => void action(() => window.dextana.saveCronJob({ ...job, enabled: !job.enabled }, job.id))}>{job.enabled ? 'Pause' : 'Resume'}</Button><Button icon={<Icon name="edit" />} variant="secondary" disabled={busy} onClick={() => { setEditing(job.id); setDraft({ ...job }); setError(''); }}>Edit</Button><Button icon={<Icon name="trash" />} variant="danger" disabled={busy} onClick={() => void action(async () => { await window.dextana.removeCronJob(job.id); if (editing === job.id) setDraft(undefined); })}>Delete</Button></div>
      {!!job.runs.length && <details className="cron-history" open><summary>Recent runs</summary>{job.runs.map(run => {
        const activity = snapshot.activities.find(a => a.id === run.activityId);
        const label = `${new Date(run.startedAt).toLocaleString()} · ${activity?.approval ? 'Needs approval' : activity?.status ?? run.status ?? (run.error ? 'Failed' : 'Starting')}`;
        return <div key={run.id}>{activity ? <Button variant="ghost" size="small" onClick={() => openActivity(activity.id)}>{label}</Button> : <span>{label}</span>}{run.error && <p>{run.error}</p>}</div>;
      })}</details>}
    </Card>)}</div>
    {!snapshot.cronJobs?.length && !draft && <EmptyState title="Make room for recurring work" description="Create a job for daily summaries, weekly reviews, or routine checks." />}
  </section>;
}
