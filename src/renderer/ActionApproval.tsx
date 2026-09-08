import { browserPermissionQuestion } from '../shared/browser-approval';
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
  const question = approval.capability === 'browser' ? browserPermissionQuestion(approval.arguments) : undefined;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function decide(approved: boolean, autoAllow = false) {
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
      {question ? <>
        <p className="permission-question">{question.question}</p>
        {question.address && <p className="permission-address">{question.address}</p>}
      </> : <>
        <p><strong>{approval.description}</strong></p>
        <p>Review this action before Dextana continues.</p>
        {['fileRead', 'fileCreate'].includes(approval.capability) ? <FileApprovalPreview arguments={approval.arguments} /> : <ApprovalDetails arguments={approval.arguments} />}
      </>}
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
      {approval.source !== 'harnest' && <button className="allow-all-button" disabled={busy} title={`Allow all ${capabilityLabel[approval.capability]} in this session`} onClick={() => void decide(true, true)}>Allow all</button>}
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
  if (!allowed.length || activity.allowAllApprovals) return null;
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

export function SessionApprovals({ activity }: { activity: Activity }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <div className="session-approvals">
    <select aria-label="Session approvals" value={activity.allowAllApprovals ? 'allow' : 'ask'} disabled={busy || !!activity.approval} title="Applies to this session. Fused token creation still requires approval." onChange={async event => {
      const allow = event.target.value === 'allow'; setBusy(true); setError('');
      try { await window.dextana.setSessionApprovals(activity.id, allow); }
      catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
    }}><option value="ask">Ask for approval</option><option value="allow">Allow all in this session</option></select>
    {error && <span role="alert">{error}</span>}
  </div>;
}
