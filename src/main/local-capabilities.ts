import { FUSED_TOKEN_LIFETIME } from '../shared/fused-token';
import { browserApprovalDetails } from '../shared/browser-approval';
import { prepareBrowserAction, assertBrowserDestination } from './user-browser/routing';
import { rememberFile, rememberURL } from './context';
import { randomUUID } from 'node:crypto';
import type { Activity, DesktopAPI, Approval } from '../shared/types';
import { prepareWorkPlan, executionPlan, coversFile, coversBrowser } from './plans';
import { Store } from './store';
import { Browsers } from './browser';
import { Fused } from './fused';
import { WorkFiles, imageExtensions } from './files';
import { endpoint } from './settings';
import { MCPConnections } from './mcp';
import type { DesktopGateway } from './desktop/gateway';
import { DesktopInvocations } from './desktop/invocations';
import { desktopActionLabel } from '../shared/desktop-presentation';

export class ActionDenied extends Error {}

export class LocalCapabilities {
  private approvals = new Map<
    string,
    { activityId: string; deciding?: boolean; resolve: (value: boolean) => void }
  >();
  private browserPreferencesWriting = false;
  private permissionWrites = new Set<string>();
  constructor(
    private store: Store,
    private publish: () => void,
    private browsers: Browsers,
    private fused: Fused,
    private mcp?: MCPConnections,
    private files?: WorkFiles,
    private receipt: (activity: Activity) => Promise<void> = () => this.store.save(),
    desktop?: DesktopGateway,
  ) {
    if (desktop)
      this.desktop = new DesktopInvocations(
        desktop,
        (activity) =>
          !this.permissionWrites.has(activity.id) &&
          (activity.allowAllApprovals === true || activity.permissions?.desktop === true),
        this.receipt,
      );
  }
  private desktop?: DesktopInvocations;
  async attachContext(activityId: string, paths: string[]) {
    const activity = this.store.state.activities.find((item) => item.id === activityId);
    if (!activity || activity.archived) throw new Error('Choose an active chat.');
    if (!Array.isArray(paths) || paths.length > 20 || !this.files)
      throw new Error('Attach up to 20 documents at a time.');
    const plans = await Promise.all(
      paths.map((path) => this.files!.prepare({ action: 'read', path })),
    );
    const previous = structuredClone(activity.context);
    for (const plan of plans) rememberFile(activity, plan.path, 'selected');
    try {
      await this.store.save();
    } catch (error) {
      activity.context = previous;
      this.publish();
      throw error;
    }
    this.publish();
  }
  async setSessionApprovals(activityId: string, allowAll: boolean) {
    const activity = this.store.state.activities.find((item) => item.id === activityId);
    if (!activity || typeof allowAll !== 'boolean')
      throw new Error('Invalid session approval setting.');
    if (activity.approval || this.permissionWrites.has(activityId))
      throw new Error('Resolve the pending permission first.');
    this.permissionWrites.add(activityId);
    const previous = {
      allowAllApprovals: activity.allowAllApprovals,
      permissions: activity.permissions,
    };
    activity.allowAllApprovals = allowAll;
    if (!allowAll) activity.permissions = { browser: false };
    try {
      await this.store.save();
    } catch (error) {
      Object.assign(activity, previous);
      throw error;
    } finally {
      this.permissionWrites.delete(activityId);
      this.publish();
    }
  }
  async setBrowserPreferences(input: Parameters<DesktopAPI['setBrowserPreferences']>[0]) {
    if (!input || typeof input.autoAllow !== 'boolean') throw new Error('Invalid browser default.');
    if (this.browserPreferencesWriting) throw new Error('Browser defaults are already being saved.');
    this.browserPreferencesWriting = true;
    const previous = this.store.state.browserPreferences;
    this.store.state.browserPreferences = { autoAllow: input.autoAllow };
    try {
      await this.store.save();
    } catch (error) {
      this.store.state.browserPreferences = previous;
      throw error;
    } finally {
      this.browserPreferencesWriting = false;
      this.publish();
    }
  }
  async setPermission(input: Parameters<DesktopAPI['setPermission']>[0]) {
    if (
      !input ||
      !['browser', 'mcp', 'fileRead', 'fileCreate', 'desktop'].includes(input.capability) ||
      (typeof input.autoAllow !== 'boolean' && !(input.capability === 'browser' && input.autoAllow === null))
    )
      throw new Error('Invalid permission setting.');
    const activity = this.store.state.activities.find((item) => item.id === input.activityId);
    if (!activity) throw new Error('Activity not found.');
    if (activity.approval)
      throw new Error('Resolve the pending action before changing chat permissions.');
    await this.savePermission(activity, input.capability, input.autoAllow);
  }
  private async savePermission(
    activity: Activity,
    capability: Approval['capability'],
    autoAllow: boolean | null,
  ) {
    if (this.permissionWrites.has(activity.id))
      throw new Error('A permission change is already being saved.');
    this.permissionWrites.add(activity.id);
    const previous = activity.permissions;
    activity.permissions = { ...previous };
    if (autoAllow === null) delete activity.permissions[capability];
    else activity.permissions[capability] = autoAllow;
    try {
      await this.store.save();
    } catch (error) {
      activity.permissions = previous;
      throw error;
    } finally {
      this.permissionWrites.delete(activity.id);
      this.publish();
    }
  }
  private validateApprovalInput(input: Parameters<DesktopAPI['approve']>[0]) {
    if (!input || typeof input.approved !== 'boolean')
      throw new Error('This approval is no longer pending.');
    if (input.autoAllow !== undefined && typeof input.autoAllow !== 'boolean')
      throw new Error('This approval is no longer pending.');
    if (input.autoAllow && !input.approved) throw new Error('This approval is no longer pending.');
  }
  async approve(input: Parameters<DesktopAPI['approve']>[0]) {
    this.validateApprovalInput(input);
    const pending = this.approvals.get(input.approvalId);
    if (!pending || pending.deciding || pending.activityId !== input.activityId)
      throw new Error('This approval is no longer pending.');
    const activity = this.store.state.activities.find((item) => item.id === pending.activityId)!;
    if (input.autoAllow && activity.approval?.source === 'harnest')
      throw new Error('Change this tool’s approval policy in MCP settings.');
    pending.deciding = true;
    try {
      if (input.autoAllow) await this.savePermission(activity, activity.approval!.capability, true);
      if (this.approvals.get(input.approvalId) !== pending)
        throw new Error('This approval was cancelled.');
      this.approvals.delete(input.approvalId);
      this.recordApprovalDecision(activity, input);
      pending.resolve(input.approved);
    } catch (error) {
      pending.deciding = false;
      throw error;
    }
  }
  private recordApprovalDecision(activity: Activity, input: Parameters<DesktopAPI['approve']>[0]) {
    activity.events.push(
      `${activity.approval!.description}: ${input.approved ? 'allowed' : 'denied'}${input.autoAllow ? '; auto-allow enabled for this chat' : ''}`,
    );
  }
  private autoAllowed(activity: Activity, capability: Approval['capability']) {
    const inherited = capability === 'browser' && activity.permissions?.browser === undefined;
    const allowed = inherited
      ? !this.browserPreferencesWriting && this.store.state.browserPreferences?.autoAllow === true
      : activity.permissions?.[capability] === true;
    return (activity.allowAllApprovals === true || allowed) && !this.permissionWrites.has(activity.id);
  }
  private async approval(
    activity: Activity,
    capability: Approval['capability'],
    description: string,
    args: string,
    signal: AbortSignal,
    nativeId?: string,
    coveredByPlan = false,
  ) {
    signal.throwIfAborted();
    if (coveredByPlan && executionPlan(this.store.state.activities, activity)) {
      activity.events.push(`${description}: covered by approved plan`);
      return true;
    }
    if (!nativeId && this.autoAllowed(activity, capability)) {
      activity.events.push(`${description}: auto-allowed for this chat`);
      return true;
    }
    const id = nativeId ?? randomUUID();
    activity.approval = {
      id,
      capability,
      description,
      arguments: args,
      ...(nativeId ? { source: 'harnest' as const } : {}),
    };
    try {
      const approved = await this.waitForApproval(activity.id, id, signal);
      signal.throwIfAborted();
      if (!approved && !nativeId)
        throw new ActionDenied('You denied this action. This turn was stopped.');
      return approved;
    } finally {
      delete activity.approval;
      this.publish();
    }
  }
  private waitForApproval(activityId: string, id: string, signal: AbortSignal) {
    return new Promise<boolean>((resolve, reject) => {
      const abort = () => {
        this.approvals.delete(id);
        reject(new Error('Approval cancelled.'));
      };
      this.approvals.set(id, {
        activityId,
        resolve: (value) => {
          signal.removeEventListener('abort', abort);
          resolve(value);
        },
      });
      signal.addEventListener('abort', abort, { once: true });
      this.publish();
    });
  }
  async archive(id: string, archived: boolean) {
    if (typeof id !== 'string' || typeof archived !== 'boolean')
      throw new Error('Invalid archive request.');
    const activity = this.store.state.activities.find((item) => item.id === id);
    if (!activity) throw new Error('Activity not found.');
    const previous = activity.archived;
    activity.archived = archived;
    try {
      await this.store.save();
    } catch (error) {
      activity.archived = previous;
      this.publish();
      throw error;
    }
    this.publish();
  }
  private nativeApprovals = new Map<string, string>();
  async execute(activity: Activity, tool: any, signal: AbortSignal) {
    let output: unknown;
    try {
      const catalog = this.isCatalog(tool);
      if (activity.turnMode === 'plan' && tool.name !== 'propose_plan' && !catalog)
        throw new Error(
          'Plan mode: work actions are blocked. Submit a plan with propose_plan and wait for the owner to approve it.',
        );
      output = await this.dispatch(activity, tool, signal);
    } catch (error) {
      if (error instanceof ActionDenied) throw error;
      signal.throwIfAborted();
      output = { error: (error as Error).message };
      activity.events.push(`${tool.name} failed: ${(error as Error).message}`);
    }
    await this.receipt(activity);
    this.publish();
    return output;
  }
  private isCatalog(tool: any) {
    if (tool.name === 'mcp_bridge') return tool.arguments.phase === 'list';
    if (tool.name === 'fused') return tool.arguments.action === 'connections';
    return tool.name === 'desktop_bridge' && tool.arguments.phase === 'discover';
  }
  private dispatch(activity: Activity, tool: any, signal: AbortSignal) {
    switch (tool.name) {
      case 'desktop_bridge':
        return this.executeDesktop(activity, tool, signal);
      case 'mcp_bridge':
        return this.executeMCP(activity, tool, signal);
      case 'files':
        return this.executeFiles(activity, tool, signal);
      case 'browser':
        return this.executeBrowser(activity, tool, signal);
      case 'fused':
        return this.executeFused(activity, tool, signal);
      default:
        throw new Error('Unsupported desktop tool.');
    }
  }
  private async executeDesktop(activity: Activity, tool: any, signal: AbortSignal) {
    let output: unknown;
    if (!this.desktop) throw new Error('Desktop capabilities are unavailable.');
    output = await this.desktop.dispatch(activity, tool, signal);
    return output;
  }
  private async executeMCP(activity: Activity, tool: any, signal: AbortSignal) {
    let output: unknown;
    if (!this.mcp) throw new Error('MCP connections are unavailable.');
    const args = tool.arguments;
    if (args.phase === 'list') output = { connections: this.mcp.catalog(activity.id) };
    else if (args.phase === 'prepare')
      output = this.mcp.prepare(
        activity.id,
        tool.callId,
        args.server_id,
        args.tool_name,
        args.arguments_json,
      );
    else if (args.phase === 'execute') {
      activity.events.push('MCP tool: started; outcome unconfirmed until result');
      await this.receipt(activity);
      output = await this.mcp.execute(activity.id, tool.callId, args.ticket, signal);
      activity.events.push('MCP tool: result received');
    } else throw new Error('Invalid MCP phase.');
    return output;
  }
  private async requireImageSupport(activity: Activity, signal: AbortSignal) {
    const response = await fetch(`${endpoint(activity.ollamaUrl)}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: activity.model }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('Could not check image support for the selected model.');
    const info = await response.json();
    if (!Array.isArray(info.capabilities) || !info.capabilities.includes('vision'))
      throw new Error(
        'The selected model cannot read images. Choose a vision-capable model and try again.',
      );
  }
  private async executeFiles(activity: Activity, tool: any, signal: AbortSignal) {
    let output: unknown;
    if (!this.files) throw new Error('Work files are unavailable.');
    const plan = await this.files.prepare(tool.arguments);
    if (
      plan.action === 'read' &&
      imageExtensions.includes(plan.format) &&
      !this.store.state.settings.imageInterpreterModel &&
      activity.provider !== 'openai'
    ) {
      await this.requireImageSupport(activity, signal);
    }
    await this.approval(
      activity,
      plan.action === 'read' ? 'fileRead' : 'fileCreate',
      `File · ${plan.action} · ${plan.path}`,
      this.files.preview(plan),
      signal,
      undefined,
      coversFile(executionPlan(this.store.state.activities, activity), plan),
    );
    activity.events.push(`File ${plan.action}: started; outcome unconfirmed until result`);
    await this.receipt(activity);
    signal.throwIfAborted();
    output = await this.files.execute(plan, signal);
    rememberFile(activity, plan.path, plan.action === 'read' ? 'read' : 'created');
    activity.events.push(`File ${plan.action}: completed · ${plan.path}`);
    return output;
  }
  private async executeBrowser(activity: Activity, tool: any, signal: AbortSignal) {
    let output: unknown;
    const browserAction = prepareBrowserAction(activity, tool.arguments, args => this.browsers.prepare(activity.id, args));
    const scopedPlan = executionPlan(this.store.state.activities, activity);
    const covered = !('_userConnection' in browserAction) && coversBrowser(scopedPlan, activity, browserAction);
    await this.approval(
      activity,
      'browser',
      `Browser · ${browserAction.action}`,
      JSON.stringify(browserApprovalDetails(browserAction, activity.browser?.tabs ?? []), null, 2),
      signal,
      undefined,
      covered,
    );
    activity.events.push(`Browser ${browserAction.action}: started`);
    await this.receipt(activity);
    signal.throwIfAborted();
    assertBrowserDestination(activity, browserAction);
    output = browserAction.action === 'connect_user'
      ? await this.browsers.requestUserBrowser(activity.id, activity.title, signal)
      : await this.browsers.execute(
      activity.id,
      browserAction,
      signal,
      covered ? scopedPlan!.scope.browserOrigins : undefined,
    );
    output = {...output as object, browser: browserAction._userConnection ? 'user' : 'in-app'};
    rememberURL(activity, (output as { url?: string })?.url, 'visited');
    activity.events.push(`Browser: ${browserAction.action}`);
    return output;
  }
  private async executeFused(activity: Activity, tool: any, signal: AbortSignal) {
    let output: unknown;
    if (tool.arguments.action === 'connections') {
      output = { integrations: this.fused.connections() };
    } else {
      const integration = { ...this.fused.resolve(tool.arguments.integration_id ?? '') };
      const args = JSON.parse(tool.arguments.arguments_json || '{}');
      await this.approval(
        activity,
        'mcp',
        `MCP · ${tool.arguments.action} · ${integration.name}`,
        JSON.stringify(
          { integration: integration.name, server: integration.url, arguments: args },
          null,
          2,
        ),
        signal,
        undefined,
        !!executionPlan(this.store.state.activities, activity)?.scope.fusedIntegrations.some(
          (item) => item.id === integration.id && item.revision === integration.revision,
        ),
      );
      activity.events.push(
        `Fused ${integration.name} ${tool.arguments.action}: started; outcome unconfirmed until result`,
      );
      await this.receipt(activity);
      signal.throwIfAborted();
      if (this.fused.resolve(integration.id).revision !== integration.revision)
        throw new Error(
          'The MCP server changed while waiting for permission. Request permission again.',
        );
      output = await this.fused.call(
        activity.id,
        tool.arguments.action,
        tool.arguments.arguments_json || '{}',
        signal,
        integration.id,
        integration.revision,
      );
      activity.events.push(`Fused ${integration.name}: ${tool.arguments.action}`);
    }
    return output;
  }
  preparePlan(tool: any) {
    return prepareWorkPlan(tool.arguments, '', this.store.state, this.files);
  }
  async decideRuntimeApproval(activity: Activity, event: any, signal: AbortSignal) {
    if (event.approval?.action === 'dynamic:desktop.execute') {
      if (!this.desktop) throw new Error('Desktop capabilities are unavailable.');
      const plan = this.desktop.pending(activity.id, event.approval.callId, event.approval.id);
      return this.approval(
        activity,
        'desktop',
        desktopActionLabel(plan.operation.name),
        JSON.stringify(plan.details, null, 2),
        signal,
        event.approval.id,
      );
    }
    return this.decideMCPApproval(activity, event, signal);
  }
  private async decideMCPApproval(activity: Activity, event: any, signal: AbortSignal) {
    if (!this.mcp || event.approval?.action !== 'dynamic:mcp.execute')
      throw new Error('Unsupported runtime approval.');
    const plan = this.mcp.pending(activity.id, event.approval.callId);
    this.nativeApprovals.set(event.approval.id, event.approval.callId);
    const native = plan.needsToken ? plan.connection.fusedNative : undefined;
    const covered =
      !native &&
      !!executionPlan(this.store.state.activities, activity)?.scope.mcpTools.some(
        (item) =>
          item.serverId === plan.connection.id &&
          item.toolName === plan.tool.name &&
          item.revision === plan.connection.revision &&
          item.fingerprint === plan.tool.fingerprint,
      );
    const approved = await this.approval(
      activity,
      'mcp',
      native
        ? `${plan.connection.name} · Create agent token and ${plan.tool.name}`
        : `${plan.connection.name} · ${plan.tool.name}`,
      JSON.stringify(
        {
          server: plan.connection.name,
          tool: plan.tool.name,
          arguments: plan.args,
          ...(native
            ? {
                token: {
                  operations: native.operations.length ? native.operations : ['*'],
                  expiresIn: FUSED_TOKEN_LIFETIME,
                  version: native.server.version,
                  endpoint: plan.connection.url,
                  scope:
                    'Token covers allowed operations across versions; Dext uses only this version endpoint.',
                  purpose: `Create a scoped token, then run ${plan.tool.name} with these arguments.`,
                },
              }
            : {}),
        },
        null,
        2,
      ),
      signal,
      event.approval.id,
      covered,
    );
    return approved;
  }
  grant(activity: Activity, event: any) {
    if (this.desktop?.grant(activity.id, event.approvalId)) return;
    const callId = this.nativeApprovals.get(event.approvalId);
    if (!callId || !this.mcp) throw new Error('No matching MCP approval.');
    this.mcp.grant(activity.id, callId);
    this.nativeApprovals.delete(event.approvalId);
  }
  release(id: string) {
    this.browsers.releaseUserBrowser?.(id);
    this.mcp?.release(id);
    this.desktop?.release(id);
  }
}
