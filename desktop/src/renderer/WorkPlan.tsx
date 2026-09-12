import { AgentPlan, Button, Icon, Notice } from './ui';
import { useState } from 'react';
import type { Activity, WorkPlan as Plan } from '../shared/types';
import { ReviewIcon } from './ReviewIcon';

const labels: Record<Plan['status'], string> = {
  proposed: 'Awaiting approval',
  approved: 'In progress',
  completed: 'Completed',
  declined: 'Declined',
  superseded: 'Replaced by a newer request',
  interrupted: 'Interrupted',
  stopped: 'Stopped',
};
export function WorkPlan({ plan, activity }: { plan: Plan; activity: Activity }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = plan.status === 'proposed';
  const scopeCount = Object.values(plan.scope).reduce((count, items) => count + items.length, 0);
  async function decide(approved: boolean) {
    setBusy(true);
    setError('');
    try {
      await window.dextana.decidePlan({ activityId: activity.id, planId: plan.id, approved });
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AgentPlan
      title={plan.title}
      status={plan.status}
      statusLabel={labels[plan.status]}
      steps={plan.steps}
      busy={busy}
      permissions={
        <details className="work-plan-scope" open={pending || undefined}>
          <summary>
            <ReviewIcon name="shield" />
            <span>Included permissions</span>
            <span className="work-plan-scope-count">{scopeCount}</span>
            <ReviewIcon name="chevron" />
          </summary>
          <div className="work-plan-scope-body">
            <p>For this plan’s run and its workers only.</p>
            <ul className="work-plan-resources">
              {plan.scope.browserOrigins.map((origin) => (
                <li key={origin}>
                  <ReviewIcon name="browser" />
                  <div>
                    <span className="work-plan-resource-label">Browse and interact</span>
                    <span>{origin}</span>
                  </div>
                </li>
              ))}
              {plan.scope.files.map((file, index) => (
                <li key={index}>
                  <ReviewIcon name="file" />
                  <div>
                    <span className="work-plan-resource-label">
                      {file.action === 'read' ? 'Read file' : 'Create file'}
                    </span>
                    <span className="plan-file-path">{file.path}</span>
                  </div>
                </li>
              ))}
              {plan.scope.mcpTools.map((tool, index) => (
                <li key={index}>
                  <ReviewIcon name="integration" />
                  <div>
                    <span className="work-plan-resource-label">Use connected tool</span>
                    <span>
                      {tool.serverName} · {tool.toolName}
                    </span>
                  </div>
                </li>
              ))}
              {plan.scope.fusedIntegrations.map((integration) => (
                <li key={integration.id}>
                  <ReviewIcon name="integration" />
                  <div>
                    <span className="work-plan-resource-label">Use integration</span>
                    <span>{integration.name}</span>
                  </div>
                </li>
              ))}
            </ul>
            {!Object.values(plan.scope).some((items) => items.length) && (
              <p>No browser, file, or integration access requested.</p>
            )}
            <p className="muted">
              Other resources and credential setup still ask. Existing tool restrictions remain in
              effect.
            </p>
          </div>
        </details>
      }
      actions={
        pending && (
          <>
            <Button
              icon={<Icon name="check" />}
              variant="primary"
              disabled={busy || activity.status !== 'awaiting_plan'}
              onClick={() => void decide(true)}
            >
              Approve plan and start
            </Button>
            <Button
              icon={<Icon name="close" />}
              disabled={busy || activity.status !== 'awaiting_plan'}
              onClick={() => void decide(false)}
            >
              Decline plan
            </Button>
          </>
        )
      }
      footer={
        pending && (
          <p className="review-footer-note">Want to adjust it? Send a follow-up in Plan mode.</p>
        )
      }
      receipt={
        plan.approvedAt ? `Approved ${new Date(plan.approvedAt).toLocaleString()}` : undefined
      }
      error={error && <Notice tone="danger">{error}</Notice>}
    />
  );
}
