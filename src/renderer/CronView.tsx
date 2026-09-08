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
    <div className="cron-heading"><div><h1>Scheduled jobs</h1><p className="muted">Recurring work, on your schedule.</p></div><button className="primary" onClick={() => {
      setEditing(undefined); setError(''); setDraft({ name: '', prompt: '', model: snapshot.settings.defaultModel || snapshot.settings.models[0] || '', expression: '0 9 * * *', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, enabled: true });
    }}>New job</button></div>
    <p className="cron-note">Scheduled by your local backend while Dextana is open and your computer is awake. Missed runs are skipped. Actions still ask for approval.</p>
    {(error || snapshot.cronError) && <p role="alert" className="error">{error || snapshot.cronError}</p>}
    {draft && <form className="cron-editor" onSubmit={event => { event.preventDefault(); void action(async () => { await window.dextana.saveCronJob(draft, editing); setDraft(undefined); }); }}>
      <h2>{editing ? 'Edit job' : 'New scheduled job'}</h2>
      <label>Job name<input autoFocus value={draft.name} maxLength={80} required onChange={e => setDraft({ ...draft, name: e.target.value })}/></label>
      <label>Job instructions<textarea value={draft.prompt} maxLength={32000} required rows={3} onChange={e => setDraft({ ...draft, prompt: e.target.value })}/></label>
      <div className="cron-fields"><label>Schedule<select value={['0 9 * * *', '0 9 * * 1-5', '0 * * * *'].includes(draft.expression) ? draft.expression : 'custom'} onChange={e => setDraft({ ...draft, expression: e.target.value === 'custom' ? '30 9 * * *' : e.target.value })}>
        <option value="0 9 * * *">Every day at 9:00</option><option value="0 9 * * 1-5">Weekdays at 9:00</option><option value="0 * * * *">Every hour</option><option value="custom">Custom cron</option>
      </select></label><label>Time zone<input required value={draft.timezone} onChange={e => setDraft({ ...draft, timezone: e.target.value })}/></label></div>
      <div className="cron-fields"><label>Cron expression<input required value={draft.expression} onChange={e => setDraft({ ...draft, expression: e.target.value })}/><small>minute · hour · day · month · weekday</small></label><label>Model<select value={draft.model} required onChange={e => setDraft({ ...draft, model: e.target.value })}>{snapshot.settings.models.map(model => <option key={model}>{model}</option>)}</select></label></div>
      <div className="cron-actions"><button className="primary" disabled={busy}>Save job</button><button type="button" disabled={busy} onClick={() => setDraft(undefined)}>Cancel</button></div>
    </form>}
    <div className="cron-list">{(snapshot.cronJobs ?? []).map(job => <article className="cron-card" aria-label={job.name} key={job.id}>
      <div className="cron-heading"><h2>{job.name}</h2><span className={`cron-badge ${job.enabled ? 'enabled' : ''}`}>{job.enabled ? 'Scheduled' : 'Paused'}</span></div>
      <p className="cron-prompt">{job.prompt}</p>
      <p className="cron-meta"><code>{job.expression}</code> · {job.timezone} · {job.model}</p>
      {job.enabled && job.nextRunAt && <p className="cron-meta">Next run · {new Date(job.nextRunAt).toLocaleString(undefined, { timeZone: job.timezone })}</p>}
      {job.error && <p role="status">{job.error}</p>}
      <div className="cron-actions"><button disabled={busy} onClick={() => void action(() => window.dextana.runCronJob(job.id))}>Run now</button><button disabled={busy} onClick={() => void action(() => window.dextana.saveCronJob({ ...job, enabled: !job.enabled }, job.id))}>{job.enabled ? 'Pause' : 'Resume'}</button><button disabled={busy} onClick={() => { setEditing(job.id); setDraft({ ...job }); setError(''); }}>Edit</button><button disabled={busy} onClick={() => void action(async () => { await window.dextana.removeCronJob(job.id); if (editing === job.id) setDraft(undefined); })}>Delete</button></div>
      {!!job.runs.length && <details className="cron-history" open><summary>Recent runs</summary>{job.runs.map(run => {
        const activity = snapshot.activities.find(a => a.id === run.activityId);
        const label = `${new Date(run.startedAt).toLocaleString()} · ${activity?.approval ? 'Needs approval' : activity?.status ?? (run.error ? 'Failed' : 'Starting')}`;
        return <div key={run.id}>{activity ? <button onClick={() => openActivity(activity.id)}>{label}</button> : <span>{label}</span>}{run.error && <p>{run.error}</p>}</div>;
      })}</details>}
    </article>)}</div>
    {!snapshot.cronJobs?.length && !draft && <div className="cron-empty"><h2>Make room for recurring work</h2><p>Create a job for daily summaries, weekly reviews, or routine checks.</p></div>}
  </section>;
}
