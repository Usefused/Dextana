import { randomUUID } from 'node:crypto';
import type { Activity, Snapshot, WorkPlan } from '../shared/types';
import type { FilePlan, WorkFiles } from './files';
import { externalURL } from '../shared/links';

function strings(value: unknown, label: string, maximum = 30): string[] {
  if (
    !Array.isArray(value) ||
    value.length > maximum ||
    value.some(
      (item) =>
        typeof item !== 'string' || !item.trim() || item.length > 4096 || /[\x00-\x1f]/.test(item),
    )
  )
    throw new Error(`Provide a valid ${label} list (up to ${maximum} items).`);
  return [...new Set(value.map((item) => item.trim()))];
}
export async function prepareWorkPlan(
  args: Record<string, unknown>,
  messageId: string,
  state: Snapshot,
  files?: WorkFiles,
): Promise<WorkPlan> {
  if (typeof args.title !== 'string' || !args.title.trim() || args.title.length > 160)
    throw new Error('Give the plan a short title.');
  const steps = strings(args.steps, 'steps', 12);
  if (!steps.length) throw new Error('Include at least one concrete step.');
  const browserOrigins = [
    ...new Set(
      strings(args.browser_urls ?? [], 'websites').map((value) => {
        const url = externalURL(value);
        if (!url || new URL(url).username || new URL(url).password)
          throw new Error('Plan websites must be HTTP or HTTPS addresses without credentials.');
        return new URL(url).origin;
      }),
    ),
  ];
  const fileScope: WorkPlan['scope']['files'] = [];
  for (const action of ['read', 'create'] as const) {
    for (const path of strings(
      args[action === 'read' ? 'file_reads' : 'file_creates'] ?? [],
      'documents',
    )) {
      if (!files) throw new Error('Work files are unavailable.');
      const prepared = await files.prepare({
        action,
        path,
        sheets_json: '[{"name":"Planned document","rows":[]}]',
      });
      fileScope.push({ action, path: prepared.path, parentIdentity: prepared.parentIdentity });
    }
  }
  const requested = args.mcp_tools ?? [];
  if (!Array.isArray(requested) || requested.length > 30)
    throw new Error('Choose up to 30 enabled integration tools.');
  const mcpTools = requested.map((value) => {
    const connection = state.mcpConnections?.find(
      (item) => item.id === value?.server_id && item.enabled,
    );
    const tool = connection?.tools.find(
      (item) => item.name === value?.tool_name && item.policy !== 'disabled',
    );
    if (!connection || !tool || (connection.fusedNative && tool.name === 'connect'))
      throw new Error(
        'Choose enabled tools from the local catalog. Credential setup requires its own approval.',
      );
    return {
      serverId: connection.id,
      serverName: connection.name,
      toolName: tool.name,
      revision: connection.revision,
      fingerprint: tool.fingerprint,
    };
  });
  const fusedIntegrations = strings(args.fused_integrations ?? [], 'integrations').map((id) => {
    const connection = state.fusedIntegrations?.find((item) => item.id === id && item.enabled);
    if (!connection) throw new Error('Choose an enabled Fused integration from the local catalog.');
    return { id, name: connection.name, revision: connection.revision };
  });
  return {
    id: randomUUID(),
    messageId,
    title: args.title.trim(),
    steps,
    status: 'proposed',
    createdAt: new Date().toISOString(),
    scope: { browserOrigins, files: fileScope, mcpTools, fusedIntegrations },
  };
}

// Approval is usable only by the current execution and its children. Saved history
// alone grants nothing; restarting or completing the owner invalidates the lease.
export function executionPlan(activities: Activity[], activity: Activity): WorkPlan | undefined {
  if (
    !activity.activePlanId ||
    activity.turnMode === 'plan' ||
    !['starting', 'running'].includes(activity.status)
  )
    return;
  const owner = activity.planOwnerId
    ? activities.find((item) => item.id === activity.planOwnerId)
    : activity;
  if (
    !owner ||
    owner.activePlanId !== activity.activePlanId ||
    !['starting', 'running'].includes(owner.status)
  )
    return;
  return owner.plans?.find(
    (plan) => plan.id === activity.activePlanId && plan.status === 'approved',
  );
}
export function coversFile(plan: WorkPlan | undefined, file: FilePlan) {
  return !!plan?.scope.files.some(
    (item) =>
      item.action === file.action &&
      item.path === file.path &&
      item.parentIdentity === file.parentIdentity,
  );
}
export function coversBrowser(
  plan: WorkPlan | undefined,
  activity: Activity,
  args: Record<string, unknown>,
) {
  if (!plan || !plan.scope.browserOrigins.length || args.action === 'clear_cookies') return false;
  if (args.action === 'list_tabs') return true;
  if (!['open', 'new_tab', 'read', 'click', 'fill', 'close_tab'].includes(String(args.action)))
    return false;
  const tab = activity.browser?.tabs?.find((item) => item.id === args.tab_id);
  const url = args.action === 'open' || args.action === 'new_tab' ? args.url : tab?.url;
  try {
    return typeof url === 'string' && plan.scope.browserOrigins.includes(new URL(url).origin);
  } catch {
    return false;
  }
}
