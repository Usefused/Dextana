import { randomUUID } from 'node:crypto';
import type { Activity } from '../../shared/types';
import type { DesktopWork } from '../../shared/desktop';
import type { DesktopGateway } from './gateway';
import { desktopActionLabel } from '../../shared/desktop-presentation';

interface DesktopCall {
  callId: string;
  arguments: {
    phase: string;
    work?: DesktopWork;
    operation?: string;
    arguments_json?: string;
    ticket?: string;
  };
}
type Prepared = Awaited<ReturnType<DesktopGateway['prepare']>>;
interface Ticket {
  activityId: string;
  callId: string;
  plan: Prepared;
  grant: 'read' | 'session' | 'approval' | 'pending';
}

/** Single-use receipts bind the reviewed arguments to one native Harnest invocation. */
export class DesktopInvocations {
  private tickets = new Map<string, Ticket>();
  private approvals = new Map<string, string>();
  constructor(
    private gateway: DesktopGateway,
    private sessionAllowed: (activity: Activity) => boolean,
    private receipt: (activity: Activity) => Promise<void>,
  ) {}

  async dispatch(activity: Activity, tool: DesktopCall, signal: AbortSignal) {
    const { phase } = tool.arguments;
    switch (phase) {
      case 'discover':
        return this.gateway.discover({ activityId: activity.id }, tool.arguments.work || undefined);
      case 'prepare':
        return this.prepare(activity, tool);
      case 'execute':
        return this.execute(activity, tool, signal);
      default:
        throw new Error('Invalid desktop transport phase.');
    }
  }

  private async prepare(activity: Activity, tool: DesktopCall) {
    const plan = await this.gateway.prepare(
      { activityId: activity.id },
      { ...tool.arguments, action: 'call' },
    );
    for (const [id, pending] of this.tickets) {
      if (pending.activityId === activity.id && pending.callId === tool.callId) this.remove(id);
    }
    const grant = plan.operation.mutates ? this.sessionGrant(activity) : 'read';
    const ticket = randomUUID();
    this.tickets.set(ticket, { activityId: activity.id, callId: tool.callId, plan, grant });
    return {
      ticket,
      requiresApproval: grant === 'pending',
      message: desktopActionLabel(plan.operation.name),
      arguments: plan.details,
    };
  }

  private sessionGrant(activity: Activity) {
    return this.sessionAllowed(activity) ? 'session' : 'pending';
  }

  private async execute(activity: Activity, tool: DesktopCall, signal: AbortSignal) {
    const ticket = tool.arguments.ticket ?? '';
    const prepared = this.tickets.get(ticket);
    if (
      !prepared ||
      prepared.activityId !== activity.id ||
      prepared.callId !== tool.callId ||
      prepared.grant === 'pending'
    )
      throw new Error('This desktop action has no matching execution grant.');
    this.remove(ticket);
    const { plan } = prepared;
    activity.events.push(
      `${desktopActionLabel(plan.operation.name)}: started; waiting for the result`,
    );
    await this.receipt(activity);
    // Permission changes may complete while the receipt is being persisted.
    if (prepared.grant === 'session' && !this.sessionAllowed(activity))
      throw new Error('Desktop permission changed. Prepare this action again.');
    const result = await plan.execute(signal);
    activity.events.push(`${desktopActionLabel(plan.operation.name)}: result received`);
    return result;
  }

  pending(activityId: string, callId: string, approvalId: string) {
    const entry = [...this.tickets.entries()].find(
      ([, pending]) => pending.activityId === activityId && pending.callId === callId,
    );
    if (!entry) throw new Error('No matching prepared desktop action.');
    const [ticket, prepared] = entry;
    this.approvals.set(approvalId, ticket);
    return prepared.plan;
  }

  grant(activityId: string, approvalId: string) {
    const ticket = this.approvals.get(approvalId);
    if (!ticket) return false;
    const prepared = this.tickets.get(ticket);
    if (!prepared || prepared.activityId !== activityId)
      throw new Error('No matching desktop approval.');
    prepared.grant = 'approval';
    this.approvals.delete(approvalId);
    return true;
  }

  private remove(ticket: string) {
    this.tickets.delete(ticket);
    for (const [approvalId, id] of this.approvals)
      if (id === ticket) this.approvals.delete(approvalId);
  }

  release(activityId: string) {
    this.gateway.release(activityId);
    for (const [ticket, pending] of this.tickets)
      if (pending.activityId === activityId) this.remove(ticket);
  }
}
