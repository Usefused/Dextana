import { useState } from 'react';
import type { Activity } from '../shared/types';
import { Field, Notice, Select } from './ui';

export function BrowserApprovalSelect({
  activity,
  defaultAutoAllow,
}: {
  activity: Activity;
  defaultAutoAllow: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const value = activity.permissions?.browser;
  return (
    <div className="browser-approval-select">
      <Field label="Browser approvals">
        {(field) => (
          <Select
            {...field}
            value={value === undefined ? 'default' : value ? 'allow' : 'ask'}
            disabled={busy || !!activity.approval || !!activity.allowAllApprovals}
            onChange={async (event) => {
              const autoAllow =
                event.target.value === 'default' ? null : event.target.value === 'allow';
              setBusy(true);
              setError('');
              try {
                await window.dextana.setPermission({
                  activityId: activity.id,
                  capability: 'browser',
                  autoAllow,
                });
              } catch (failure) {
                setError((failure as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <option value="default">
              Use global default ({defaultAutoAllow ? 'Automatically approve' : 'Ask for approval'})
            </option>
            <option value="ask">Ask for approval</option>
            <option value="allow">Automatically approve</option>
          </Select>
        )}
      </Field>
      {activity.allowAllApprovals && (
        <Notice>This chat allows all actions. Its session approval setting takes priority.</Notice>
      )}
      {activity.approval && (
        <Notice>Resolve the pending approval before changing this chat’s permissions.</Notice>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  );
}
