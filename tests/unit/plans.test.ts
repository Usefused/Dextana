import { expect, test, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Activities } from '../../src/main/activities';
import { Store } from '../../src/main/store';
import { executionPlan, coversBrowser, prepareWorkPlan } from '../../src/main/plans';
import type { Runtime } from '../../src/main/runtime';
import type { Browsers } from '../../src/main/browser';
import type { Fused } from '../../src/main/fused';
import type { Activity } from '../../src/shared/types';

const proposal = {
  title: 'Research a report',
  steps: ['Read the website'],
  browser_urls: ['https://example.com/report'],
  file_reads: [],
  file_creates: [],
  mcp_tools: [],
  fused_integrations: [],
};
function setup(worker = false) {
  const store = new Store('/unused');
  store.state.settings.models = ['test'];
  vi.spyOn(store, 'save').mockResolvedValue();
  const execute = vi.fn().mockResolvedValue({ url: 'https://example.com/report' });
  const deniedDraftActions: unknown[] = [];
  const runtime = {
    ensure: async () => {},
    request: async () => Response.json({ id: 'runtime' }),
    stream: async (
      _session: string,
      prompt: string,
      _meta: unknown,
      _signal: AbortSignal,
      _consume: unknown,
      tool: (args: unknown) => Promise<unknown>,
    ) => {
      const call = (name: string, args: object) => tool({ name, arguments: args });
      if (prompt.includes('[DEXTANA_PLAN_DRAFT]')) {
        for (const [name, args] of [
          ['browser', { action: 'open', url: 'https://example.com' }],
          ['files', { action: 'read', path: '/private.txt' }],
          ['delegate', { tasks: [{ prompt: 'Worker' }] }],
          ['mcp_bridge', { phase: 'prepare' }],
          ['fused', { action: 'execute' }],
        ] as const)
          deniedDraftActions.push(await call(name, args));
        await call('propose_plan', proposal);
      } else if (worker && !prompt.endsWith('Worker')) {
        await call('delegate', { tasks: [{ prompt: 'Worker', model: 'test' }] });
      } else {
        await call('browser', { action: 'open', url: 'https://example.com/report' });
        if (!worker)
          await call('browser', { action: 'open', url: 'https://outside.example/report' });
      }
      return { status: 'completed', outputText: 'Done' };
    },
  } as unknown as Runtime;
  const activities = new Activities(
    store,
    runtime,
    () => {},
    { execute, prepare: (_id: string, args: unknown) => args } as unknown as Browsers,
    {} as Fused,
  );
  async function draft() {
    const id = await activities.start({ prompt: 'Research', model: 'test', mode: 'plan' });
    const activity = store.state.activities.find((item) => item.id === id)!;
    await vi.waitFor(() => expect(activity.status).toBe('awaiting_plan'));
    return { activity, input: { activityId: id, planId: activity.plans![0].id, approved: true } };
  }
  return { activities, store, execute, draft, deniedDraftActions };
}

test('planning denies every work channel; approved scope groups actions but outside websites still ask', async () => {
  const { activities, store, execute, draft, deniedDraftActions } = setup();
  const { activity, input } = await draft();
  expect(deniedDraftActions).toHaveLength(5);
  expect(
    deniedDraftActions.every((value) => String((value as any).error).includes('Plan mode')),
  ).toBe(true);
  expect(execute).not.toHaveBeenCalled();
  await expect(activities.decidePlan({ ...input, activityId: 'other' })).rejects.toThrow();
  vi.mocked(store.save).mockRejectedValueOnce(new Error('Disk full'));
  await expect(activities.decidePlan(input)).rejects.toThrow('Disk full');
  expect(activity.plans![0].status).toBe('proposed');
  expect(execute).not.toHaveBeenCalled();
  await activities.decidePlan(input);
  await expect(activities.decidePlan(input)).rejects.toThrow();
  await vi.waitFor(() => expect(activity.approval).toBeDefined());
  expect(execute).toHaveBeenCalledTimes(1);
  expect(activity.approval!.arguments).toContain('outside.example');
  await activities.approve({
    activityId: activity.id,
    approvalId: activity.approval!.id,
    approved: false,
  });
  await vi.waitFor(() => expect(activity.status).toBe('cancelled'));
  expect(activity.plans![0].status).toBe('stopped');
  expect(activity.activePlanId).toBeUndefined();
  expect(activity.permissions).toBeUndefined();
  expect(activity.allowAllApprovals).toBeUndefined();
});

test('delegated workers share a live approved plan and lose its authority when the owner finishes', async () => {
  const { activities, store, execute, draft } = setup(true);
  const { activity, input } = await draft();
  await activities.decidePlan(input);
  await vi.waitFor(() => expect(activity.status).toBe('completed'));
  expect(execute).toHaveBeenCalledTimes(1);
  const child = store.state.activities.find((item) => item.parentId === activity.id)!;
  expect(child.status).toBe('completed');
  expect(child.approval).toBeUndefined();
  expect(child.events.join('\n')).toContain('covered by approved plan');
  expect(executionPlan(store.state.activities, child)).toBeUndefined();
  expect(activity.plans![0].status).toBe('completed');
});

test('declined and superseded plans cannot execute, while revisions remain in the session', async () => {
  const { activities, execute, draft } = setup();
  const { activity, input } = await draft();
  await activities.decidePlan({ ...input, approved: false });
  await expect(activities.decidePlan(input)).rejects.toThrow();
  await activities.start({
    activityId: activity.id,
    model: 'test',
    mode: 'plan',
    prompt: 'A revised report',
  });
  await vi.waitFor(() => expect(activity.status).toBe('awaiting_plan'));
  const prior = activity.plans!.at(-1)!;
  await activities.start({
    activityId: activity.id,
    model: 'test',
    mode: 'plan',
    prompt: 'A smaller report',
  });
  await vi.waitFor(() => expect(activity.status).toBe('awaiting_plan'));
  expect(prior.status).toBe('superseded');
  expect(activity.plans!.map((plan) => plan.status)).toEqual([
    'declined',
    'superseded',
    'proposed',
  ]);
  expect(execute).not.toHaveBeenCalled();
});

test('saved proposed plans survive restart but approved execution grants do not', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dextana-plan-store-'));
  try {
    const store = new Store(directory);
    await store.load();
    const plan = await prepareWorkPlan(proposal, 'message', store.state);
    const activity: Activity = {
      id: 'one',
      title: 'Plan',
      model: 'test',
      ollamaUrl: '',
      status: 'awaiting_plan',
      messages: [],
      events: [],
      plans: [plan],
      mode: 'plan',
    };
    store.state.activities.push(activity);
    await store.save();
    const reopened = new Store(directory);
    await reopened.load();
    expect(reopened.state.activities[0].plans![0].status).toBe('proposed');
    activity.status = 'running';
    activity.turnMode = 'plan';
    await store.save();
    await reopened.load();
    expect(reopened.state.activities[0].status).toBe('awaiting_plan');
    activity.status = 'running';
    activity.turnMode = 'work';
    activity.activePlanId = plan.id;
    plan.status = 'approved';
    await store.save();
    await reopened.load();
    expect(reopened.state.activities[0].plans![0].status).toBe('interrupted');
    expect(executionPlan(reopened.state.activities, reopened.state.activities[0])).toBeUndefined();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('plan scopes reject unavailable tools and unsafe websites and match origins exactly', async () => {
  const store = new Store('/unused');
  await expect(
    prepareWorkPlan({ ...proposal, browser_urls: ['file:///secret'] }, 'm', store.state),
  ).rejects.toThrow();
  await expect(
    prepareWorkPlan(
      { ...proposal, mcp_tools: [{ server_id: 'unknown', tool_name: 'send' }] },
      'm',
      store.state,
    ),
  ).rejects.toThrow('enabled');
  const plan = await prepareWorkPlan(proposal, 'm', store.state);
  expect(
    coversBrowser(plan, {} as Activity, { action: 'open', url: 'https://example.com.evil.test' }),
  ).toBe(false);
  expect(coversBrowser(plan, {} as Activity, { action: 'clear_cookies' })).toBe(false);
  expect(
    coversBrowser(plan, {} as Activity, { action: 'open', url: 'https://example.com/another' }),
  ).toBe(true);
});

test('cancelling while plan approval saves prevents execution and records the plan as stopped', async () => {
  const { activities, store, execute, draft } = setup();
  const { activity, input } = await draft();
  let saved = () => {};
  vi.mocked(store.save).mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        saved = resolve;
      }),
  );
  const decision = activities.decidePlan(input);
  await vi.waitFor(() => expect(activity.status).toBe('starting'));
  await activities.cancel(activity.id);
  saved();
  await decision;
  await vi.waitFor(() => expect(activity.plans![0].status).toBe('stopped'));
  expect(execute).not.toHaveBeenCalled();
  expect(activity.activePlanId).toBeUndefined();
});
