import type { Activity } from '../shared/types';
import './compaction-status.css';

export function CompactionStatus({ activity }: {
  activity?: Pick<Activity, 'status' | 'compacting'>;
}) {
  if (!activity?.compacting || !['starting', 'running'].includes(activity.status)) return null;
  return (
    <div className="compaction-status" role="status" aria-live="polite" aria-atomic="true">
      <span className="dx-spinner" aria-hidden="true" />
      <div>
        <strong>Compacting conversation…</strong>
        <span>Keeping the important details for your next response.</span>
      </div>
    </div>
  );
}
