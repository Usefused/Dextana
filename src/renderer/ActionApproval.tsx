import { Button, Icon, Notice, PermissionCard, Select } from './ui';
import { browserPermissionQuestion } from '../shared/browser-approval';
import { ApprovalDetails } from './ApprovalDetails';
import { FileApprovalPreview } from './FileApprovalPreview';
import { useState } from 'react';
import { ReviewIcon } from './ReviewIcon';
import type { Activity, Approval } from '../shared/types';

const capabilityLabel = {
  browser: 'browser actions',
  mcp: 'MCP actions',
  fileRead: 'file reads',
  fileCreate: 'file creation',
};

export function ActionApproval({
  activityId,
  approval,
}: {
  activityId: string;
  approval: Approval;
}) {
  const question =
    approval.capability === 'browser' ? browserPermissionQuestion(approval.arguments) : undefined;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const kind = {
    browser: 'Browser',
    mcp: 'Connected service',
    fileRead: 'Read a file',
    fileCreate: 'Create a file',
  }[approval.capability];
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
    <PermissionCard
      className="approval"
      aria-label="Action approval"
      busy={busy}
      kind={kind}
      title={question?.question ?? approval.description}
      description={
        question ? 'Dext needs your permission to continue.' : 'Review what Dext is asking to do.'
      }
      actions={
        <>
          <Button
            icon={<Icon name="check" />}
            variant="primary"
            disabled={busy}
            onClick={() => void decide(true)}
          >
            Allow action
          </Button>
          <Button icon={<Icon name="close" />} disabled={busy} onClick={() => void decide(false)}>
            Deny action
          </Button>
        </>
      }
      footer={
        <>
          {approval.source !== 'harnest' && (
            <div className="review-session-access">
              <span>Allow all {capabilityLabel[approval.capability]} in this session</span>
              <Button
                icon={<Icon name="check" />}
                size="small"
                variant="ghost"
                disabled={busy}
                title={`Allow all ${capabilityLabel[approval.capability]} in this session`}
                onClick={() => void decide(true, true)}
              >
                Allow all
              </Button>
            </div>
          )}
          {error && <Notice tone="danger">{error}</Notice>}
        </>
      }
    >
      {question ? (
        question.address && (
          <div className="permission-target">
            <ReviewIcon name="browser" />
            <span>{question.address}</span>
          </div>
        )
      ) : ['fileRead', 'fileCreate'].includes(approval.capability) ? (
        <FileApprovalPreview arguments={approval.arguments} />
      ) : (
        <ApprovalDetails arguments={approval.arguments} />
      )}
    </PermissionCard>
  );
}

export function AutomaticAccess({ activity }: { activity: Activity }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const allowed = (['browser', 'mcp', 'fileRead', 'fileCreate'] as const).filter(
    (capability) => activity.permissions?.[capability] === true,
  );
  if (!allowed.length || activity.allowAllApprovals) return null;
  async function askNextTime(capability: Approval['capability']) {
    setBusy(true);
    setError('');
    try {
      await window.dextana.setPermission({ activityId: activity.id, capability, autoAllow: false });
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="permission-receipt" aria-label="Automatic access">
      {allowed.map((capability) => (
        <div className="permission-receipt-row" key={capability}>
          <span>
            {capabilityLabel[capability][0].toUpperCase() + capabilityLabel[capability].slice(1)}
          </span>
          <Button
            variant="ghost"
            size="small"
            aria-label={`Ask before ${capabilityLabel[capability]}`}
            disabled={busy || !!activity.approval}
            onClick={() => {
              void askNextTime(capability);
            }}
          >
            Ask next time
          </Button>
        </div>
      ))}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}

export function SessionApprovals({ activity }: { activity: Activity }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const hasAutomaticAccess =
    !activity.allowAllApprovals && Object.values(activity.permissions ?? {}).some(Boolean);
  return (
    <div className="session-approvals">
      {hasAutomaticAccess && (
        <details className="session-access-menu">
          <summary>Allowed actions</summary>
          <AutomaticAccess activity={activity} />
        </details>
      )}
      <Select
        aria-label="Session approvals"
        value={activity.allowAllApprovals ? 'allow' : 'ask'}
        disabled={busy || !!activity.approval}
        title="Applies to this session. Fused token creation still requires approval."
        onChange={async (event) => {
          const allow = event.target.value === 'allow';
          setBusy(true);
          setError('');
          try {
            await window.dextana.setSessionApprovals(activity.id, allow);
          } catch (failure) {
            setError((failure as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <option value="ask">Ask for approval</option>
        <option value="allow">Allow all in this session</option>
      </Select>
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
