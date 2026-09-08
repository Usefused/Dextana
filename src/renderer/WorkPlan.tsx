import { useState } from 'react';
import type { Activity, WorkPlan as Plan } from '../shared/types';

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
    <section className="work-plan" role="region" aria-label="Work plan">
      <div className="work-plan-heading">
        <span>PLAN</span>
        <span className="work-plan-status">{labels[plan.status]}</span>
      </div>
      <h3>{plan.title}</h3>
      <ol>
        {plan.steps.map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>
      <details className="work-plan-scope" open={pending || undefined}>
        <summary>Included permissions</summary>
        <p>For this plan’s run and its workers only:</p>
        <ul>
          {plan.scope.browserOrigins.map((origin) => (
            <li key={origin}>Browse and interact with {origin}</li>
          ))}
          {plan.scope.files.map((file, index) => (
            <li key={index}>
              {file.action === 'read' ? 'Read' : 'Create'}{' '}
              <span className="plan-file-path">{file.path}</span>
            </li>
          ))}
          {plan.scope.mcpTools.map((tool, index) => (
            <li key={index}>
              Use {tool.serverName} · {tool.toolName}
            </li>
          ))}
          {plan.scope.fusedIntegrations.map((integration) => (
            <li key={integration.id}>Use {integration.name} integration</li>
          ))}
        </ul>
        {!Object.values(plan.scope).some((items) => items.length) && (
          <p>No browser, file, or integration access requested.</p>
        )}
        <p className="muted">
          Other resources and credential setup still ask. Existing tool restrictions remain in
          effect.
        </p>
      </details>
      {pending && (
        <>
          <p className="muted">To change this plan, send a follow-up in Plan mode.</p>
          <div className="work-plan-actions">
            <button
              className="primary"
              disabled={busy || activity.status !== 'awaiting_plan'}
              onClick={() => void decide(true)}
            >
              Approve plan and start
            </button>
            <button
              className="secondary"
              disabled={busy || activity.status !== 'awaiting_plan'}
              onClick={() => void decide(false)}
            >
              Decline plan
            </button>
          </div>
        </>
      )}
      {plan.approvedAt && (
        <p className="work-plan-receipt">Approved {new Date(plan.approvedAt).toLocaleString()}</p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
