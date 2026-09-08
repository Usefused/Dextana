import { ApprovalDetails } from './ApprovalDetails';
import { FileApprovalPreview } from './FileApprovalPreview';
import { useState } from 'react';
import type { Activity, Approval } from '../shared/types';

const capabilityLabel = { browser: 'browser actions', mcp: 'MCP actions', fileRead: 'file reads', fileCreate: 'file creation' };

export function ActionApproval({
  activityId,
  approval,
}: {
  activityId: string;
  approval: Approval;
}) {
  const [autoAllow, setAutoAllow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function decide(approved: boolean) {
    setBusy(true);
    setError('');
    try {
      await window.dextana.approve({
        activityId,
        approvalId: approval.id,
        approved,
        autoAllow: approved && autoAllow,
      });
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="approval" aria-label="Action approval">
      <h2>Permission needed</h2>
      <p>
        <strong>{approval.description}</strong>
      </p>
      <p>Review this action before Dextana continues.</p>
      {['fileRead', 'fileCreate'].includes(approval.capability) ? <FileApprovalPreview arguments={approval.arguments} /> : <ApprovalDetails arguments={approval.arguments} />}
      {approval.source !== 'harnest' && (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={autoAllow}
            disabled={busy}
            onChange={(event) => setAutoAllow(event.target.checked)}
          />
          Auto-allow {capabilityLabel[approval.capability]} in this chat
        </label>
      )}
      <p className="muted">
        {approval.source === 'harnest'
          ? 'This tool requires permission for every execution. Change its policy in MCP connection settings.'
          : 'Auto-allow applies only to this chat. Use Ask next time on the confirmation below to turn it off.'}
      </p>
      <button
        className="primary"
        disabled={busy}
        onClick={() => {
          void decide(true);
        }}
      >
        Allow action
      </button>{' '}
      <button
        className="secondary"
        disabled={busy}
        onClick={() => {
          void decide(false);
        }}
      >
        Deny action
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}

export function AutomaticAccess({ activity }: { activity: Activity }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const allowed = (['browser', 'mcp', 'fileRead', 'fileCreate'] as const).filter(capability => activity.permissions?.[capability] === true);
  if (!allowed.length) return null;
  async function askNextTime(capability: Approval['capability']) {
    setBusy(true);
    setError('');
    try { await window.dextana.setPermission({ activityId: activity.id, capability, autoAllow: false }); }
    catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="permission-receipt" aria-label="Automatic access">
    <p>You allowed these actions automatically in this chat.</p>
    {allowed.map(capability => <div className="permission-receipt-row" key={capability}>
      <span>{capabilityLabel[capability][0].toUpperCase() + capabilityLabel[capability].slice(1)}</span>
      <button aria-label={`Ask before ${capabilityLabel[capability]}`} disabled={busy || !!activity.approval} onClick={() => { void askNextTime(capability); }}>Ask next time</button>
    </div>)}
    {error && <p role="alert" className="error">{error}</p>}
  </section>;
}
