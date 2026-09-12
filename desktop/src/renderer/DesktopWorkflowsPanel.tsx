import { useState } from 'react';
import type {
  DesktopWorkflowSnapshot,
  DesktopWatchRule,
  DesktopProcessingJob,
  DesktopRenamePreview,
} from '../shared/desktop-workflows';
import { Badge, Button, Card, EmptyState, Icon, SectionHeader } from './ui';

interface PanelProps {
  snapshot: DesktopWorkflowSnapshot;
  onAction: (
    operation: string,
    args: Record<string, unknown>,
    activityId: string,
  ) => Promise<unknown>;
  onOpenActivity: (id: string) => void;
}
interface WorkflowControls {
  busy: boolean;
  action: (
    operation: string,
    args: Record<string, unknown>,
    activityId: string,
  ) => Promise<boolean>;
  onOpenActivity: (id: string) => void;
}
function OpenChatButton({
  activityId,
  busy,
  onOpenActivity,
}: Pick<WorkflowControls, 'busy' | 'onOpenActivity'> & { activityId: string }) {
  return (
    <Button
      variant="secondary"
      icon={<Icon name="arrow" />}
      disabled={busy}
      onClick={() => onOpenActivity(activityId)}
    >
      Open chat
    </Button>
  );
}
function WatchControls({
  rule,
  busy,
  action,
  onOpenActivity,
}: WorkflowControls & { rule: DesktopWatchRule }) {
  return (
    <div className="cron-actions">
      <OpenChatButton activityId={rule.activityId} busy={busy} onOpenActivity={onOpenActivity} />
      {rule.status !== 'running' && (
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() =>
            void action(
              'workflow.watch_set_enabled',
              { id: rule.id, enabled: !rule.enabled },
              rule.activityId,
            )
          }
        >
          {rule.enabled ? 'Pause watch' : 'Resume watch'}
        </Button>
      )}
      {rule.status === 'error' && !!rule.pending.length && (
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => void action('workflow.watch_run', { id: rule.id }, rule.activityId)}
        >
          Retry pending files
        </Button>
      )}
      <Button
        variant="danger"
        icon={<Icon name="trash" />}
        disabled={busy}
        onClick={() => void action('workflow.watch_remove', { id: rule.id }, rule.activityId)}
      >
        Remove watch
      </Button>
    </div>
  );
}
function WatchCard({ rule, ...controls }: WorkflowControls & { rule: DesktopWatchRule }) {
  const active = rule.enabled && rule.status !== 'error';
  return (
    <Card as="article" className="cron-card" aria-label={rule.name} data-desktop-resource={rule.id}>
      <div className="cron-heading">
        <h3>{rule.name}</h3>
        <Badge tone={active ? 'success' : 'neutral'}>{rule.status}</Badge>
      </div>
      <p className="cron-meta">{rule.folder}</p>
      <p className="cron-prompt">{rule.prompt}</p>
      <p className="cron-meta">
        {rule.extensions.length ? rule.extensions.join(', ') : 'All regular files'} ·{' '}
        {rule.pending.length} pending
      </p>
      {rule.error && <p role="status">{rule.error}</p>}
      <WatchControls rule={rule} {...controls} />
    </Card>
  );
}
function ProcessingCard({
  job,
  busy,
  action,
  onOpenActivity,
}: WorkflowControls & { job: DesktopProcessingJob }) {
  const filename = job.outputPath.split(/[\\/]/).at(-1);
  const cancellable = ['queued', 'running', 'paused'].includes(job.status);
  return (
    <Card
      as="article"
      className="cron-card"
      aria-label={`${job.kind} ${filename}`}
      data-desktop-resource={job.id}
    >
      <div className="cron-heading">
        <h3>
          {job.kind} · {filename}
        </h3>
        <Badge tone={job.status === 'completed' ? 'success' : 'neutral'}>{job.status}</Badge>
      </div>
      <p className="cron-meta">{job.outputPath}</p>
      {job.error && <p role="status">{job.error}</p>}
      <div className="cron-actions">
        <OpenChatButton activityId={job.activityId} busy={busy} onOpenActivity={onOpenActivity} />
        {job.status === 'completed' && (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void action('workflow.handoff', { path: job.outputPath }, job.activityId)
            }
          >
            Open result
          </Button>
        )}
        {cancellable && (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => void action('processing.cancel', { id: job.id }, job.activityId)}
          >
            Cancel processing
          </Button>
        )}
      </div>
    </Card>
  );
}
function RenameTable({ batch, reviewing }: { batch: DesktopRenamePreview; reviewing: boolean }) {
  return (
    <details className="cron-history" open={reviewing}>
      <summary>Review filenames</summary>
      <div className="rich-table" tabIndex={0}>
        <table aria-label="Rename preview">
          <thead>
            <tr>
              <th>Current name</th>
              <th>New name</th>
            </tr>
          </thead>
          <tbody>
            {batch.entries.map((entry) => (
              <tr key={entry.from}>
                <td>{entry.from}</td>
                <td>{entry.to}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
function RenameCard({
  batch,
  busy,
  action,
  onOpenActivity,
}: WorkflowControls & { batch: DesktopRenamePreview }) {
  const [review, setReview] = useState<'apply' | 'undo'>();
  const canUndo =
    ['applied', 'partial'].includes(batch.status) && batch.entries.some((entry) => entry.moved);
  async function confirm() {
    if (!review) return;
    const succeeded = await action(
      review === 'undo' ? 'workflow.rename_undo' : 'workflow.rename_apply',
      { id: batch.id },
      batch.activityId,
    );
    // Keep the review open after a conflict so the owner can inspect the error and filenames together.
    if (succeeded) setReview(undefined);
  }
  return (
    <Card
      as="article"
      className="cron-card"
      aria-label={`Rename ${batch.entries.length} files`}
      data-desktop-resource={batch.id}
    >
      <div className="cron-heading">
        <h3>
          {batch.entries.length} file{batch.entries.length === 1 ? '' : 's'}
        </h3>
        <Badge tone={batch.status === 'applied' ? 'success' : 'neutral'}>{batch.status}</Badge>
      </div>
      {batch.error && <p role="status">{batch.error}</p>}
      <RenameTable batch={batch} reviewing={review !== undefined} />
      <div className="cron-actions">
        <OpenChatButton activityId={batch.activityId} busy={busy} onOpenActivity={onOpenActivity} />
        {batch.status === 'preview' && (
          <Button
            variant="secondary"
            icon={<Icon name="plan" />}
            disabled={busy}
            onClick={() => setReview('apply')}
          >
            Review rename
          </Button>
        )}
        {canUndo && (
          <Button
            variant="secondary"
            icon={<Icon name="plan" />}
            disabled={busy}
            onClick={() => setReview('undo')}
          >
            Review undo
          </Button>
        )}
        {review && (
          <>
            <Button
              variant="primary"
              icon={<Icon name="check" />}
              disabled={busy}
              onClick={() => void confirm()}
            >
              {review === 'undo' ? 'Confirm undo' : 'Confirm rename'}
            </Button>
            <Button
              variant="secondary"
              icon={<Icon name="plan" />}
              disabled={busy}
              onClick={() => setReview(undefined)}
            >
              Cancel
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
function WorkflowGroups({
  snapshot,
  ...controls
}: WorkflowControls & { snapshot: DesktopWorkflowSnapshot }) {
  return (
    <>
      {!!snapshot.watches.length && <SectionHeader title="Watched folders" />}
      <div className="cron-list">
        {snapshot.watches.map((rule) => (
          <WatchCard key={rule.id} rule={rule} {...controls} />
        ))}
      </div>
      {!!snapshot.jobs.length && <SectionHeader title="Local processing" />}
      <div className="cron-list">
        {snapshot.jobs
          .slice()
          .reverse()
          .map((job) => (
            <ProcessingCard key={job.id} job={job} {...controls} />
          ))}
      </div>
      {!!snapshot.renames.length && <SectionHeader title="File organisation" />}
      <div className="cron-list">
        {snapshot.renames
          .slice()
          .reverse()
          .map((batch) => (
            <RenameCard key={batch.id} batch={batch} {...controls} />
          ))}
      </div>
    </>
  );
}
export function DesktopWorkflowsPanel({ snapshot, onAction, onOpenActivity }: PanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const empty = snapshot.watches.length + snapshot.jobs.length + snapshot.renames.length === 0;
  async function action(operation: string, args: Record<string, unknown>, activityId: string) {
    setBusy(true);
    setError('');
    try {
      await onAction(operation, args, activityId);
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="cron-view" aria-label="Desktop workflows">
      <SectionHeader
        title="Desktop workflows"
        description="Watch folders, organise files and process documents locally. Ask in chat to get started."
        actions={
          <Badge tone="neutral">{snapshot.onBattery ? 'On battery' : 'External power'}</Badge>
        }
      />
      <p className="cron-meta">
        {snapshot.pauseOnBattery
          ? 'Background work pauses on battery.'
          : 'Background work may run on battery.'}{' '}
        Dextana must be open.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {empty && (
        <EmptyState
          title="Your desktop work starts in chat"
          description="Try “Watch my invoices folder” or “Preview names for these receipts”. Saved workflows and results will appear here."
        />
      )}
      <WorkflowGroups
        snapshot={snapshot}
        busy={busy}
        action={action}
        onOpenActivity={onOpenActivity}
      />
    </section>
  );
}
