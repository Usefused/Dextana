import { expect, test, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalCapabilities } from '../../src/main/local-capabilities';
import { Store } from '../../src/main/store';
import { executionPlan, coversBrowser, prepareWorkPlan } from '../../src/main/plans';
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


test('Electron blocks all local work in plan mode and enforces the backend execution scope', async () => {
  const store = new Store('/unused');
  vi.spyOn(store, 'save').mockResolvedValue();
  const execute = vi.fn().mockResolvedValue({ url: 'https://example.com/report' });
  const local = new LocalCapabilities(store, () => {}, { execute, prepare: (_id: string, args: unknown) => args } as unknown as Browsers, {} as Fused);
  const activity: Activity = { id: 'owner', title: 'Plan', model: 'test', ollamaUrl: '', status: 'running', turnMode: 'plan', messages: [], events: [] };
  store.state.activities.push(activity);
  const signal = new AbortController().signal;
  for (const name of ['browser', 'files', 'mcp_bridge', 'fused']) {
    const output = await local.execute(activity, { name, arguments: { action: 'execute', phase: 'prepare' } }, signal);
    expect((output as any).error).toContain('Plan mode');
  }
  expect(execute).not.toHaveBeenCalled();
  const plan = await prepareWorkPlan(proposal, 'message', store.state);
  plan.status = 'approved';
  activity.plans = [plan]; activity.activePlanId = plan.id; activity.turnMode = 'work';
  await local.execute(activity, { name: 'browser', arguments: { action: 'open', url: 'https://example.com/report' } }, signal);
  expect(execute).toHaveBeenCalledOnce();
  const controller = new AbortController();
  const outside = local.execute(activity, { name: 'browser', arguments: { action: 'open', url: 'https://outside.example/report' } }, controller.signal);
  await vi.waitFor(() => expect(activity.approval).toBeDefined());
  expect(execute).toHaveBeenCalledOnce();
  controller.abort();
  await expect(outside).rejects.toThrow();
  const child = { ...activity, id: 'child', parentId: 'owner', planOwnerId: 'owner', plans: [], approval: undefined };
  store.state.activities.push(child);
  expect(executionPlan(store.state.activities, child)).toBe(plan);
  activity.status = 'completed';
  expect(executionPlan(store.state.activities, child)).toBeUndefined();
});
