import { expect, test, vi } from 'vitest';
import type { Activity } from '../../src/shared/types';
import { Store } from '../../src/main/store';
import { LocalCapabilities } from '../../src/main/local-capabilities';
import { DesktopGateway } from '../../src/main/desktop/gateway';
import { ActionApproval } from '../../src/renderer/ActionApproval';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

test('native desktop approval binds the exact Harnest call and cannot be replayed', async () => {
  const execute = vi.fn().mockResolvedValue({ id: 'timer' });
  const gateway = new DesktopGateway([
    {
      operations: () => [
        {
          name: 'timer.start',
          work: 'time',
          description: 'Start a timer',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          mutates: true,
        },
      ],
      execute,
    },
  ]);
  const store = new Store('/unused');
  vi.spyOn(store, 'save').mockResolvedValue();
  const activity = {
    id: 'chat',
    status: 'running',
    messages: [],
    events: [],
  } as unknown as Activity;
  store.state.activities = [activity];
  const local = new LocalCapabilities(
    store,
    () => {},
    {} as any,
    {} as any,
    undefined,
    undefined,
    async () => {},
    gateway,
  );
  const signal = new AbortController().signal;
  const call = (phase: string, args = {}, callId = 'native-call') =>
    local.execute(
      activity,
      { name: 'desktop_bridge', callId, arguments: { phase, ...args } },
      signal,
    ) as Promise<any>;
  await call('discover', { work: 'time' });
  const prepared = await call('prepare', { operation: 'timer.start', arguments_json: '{}' });
  expect(prepared.requiresApproval).toBe(true);
  expect((await call('execute', { ticket: prepared.ticket })).error).toContain('grant');
  expect(execute).not.toHaveBeenCalled();
  const decision = local.decideRuntimeApproval(
    activity,
    { approval: { id: 'approval', callId: 'native-call', action: 'dynamic:desktop.execute' } },
    signal,
  );
  await vi.waitFor(() => expect(activity.approval?.id).toBe('approval'));
  await local.approve({ activityId: activity.id, approvalId: 'approval', approved: true });
  expect(await decision).toBe(true);
  local.grant(activity, { approvalId: 'approval' });
  expect((await call('execute', { ticket: prepared.ticket }, 'wrong-call')).error).toContain(
    'grant',
  );
  expect(await call('execute', { ticket: prepared.ticket })).toEqual({ id: 'timer' });
  expect((await call('execute', { ticket: prepared.ticket })).error).toContain('grant');
  expect(execute).toHaveBeenCalledOnce();
});

test('plan mode can discover desktop catalogs but cannot prepare effects', async () => {
  const store = new Store('/unused');
  vi.spyOn(store, 'save').mockResolvedValue();
  const activity = {
    id: 'chat',
    turnMode: 'plan',
    messages: [],
    events: [],
  } as unknown as Activity;
  const local = new LocalCapabilities(
    store,
    () => {},
    {} as any,
    {} as any,
    undefined,
    undefined,
    async () => {},
    new DesktopGateway([]),
  );
  const signal = new AbortController().signal;
  expect(
    await local.execute(
      activity,
      { name: 'desktop_bridge', arguments: { phase: 'discover', work: 'time' } },
      signal,
    ),
  ).toMatchObject({ operations: [] });
  expect(
    await local.execute(
      activity,
      { name: 'desktop_bridge', arguments: { phase: 'prepare', operation: 'timer.start' } },
      signal,
    ),
  ).toMatchObject({ error: expect.stringContaining('Plan mode') });
});

test('revoking session permission while a prepared action saves its receipt prevents execution', async () => {
  const execute = vi.fn().mockResolvedValue({ id: 'timer' });
  const gateway = new DesktopGateway([
    {
      operations: () => [
        {
          name: 'timer.start',
          work: 'time',
          description: 'Start a timer',
          inputSchema: {},
          mutates: true,
        },
      ],
      execute,
    },
  ]);
  const store = new Store('/unused');
  vi.spyOn(store, 'save').mockResolvedValue();
  const activity = {
    id: 'chat',
    messages: [],
    events: [],
    permissions: { desktop: true },
  } as unknown as Activity;
  store.state.activities = [activity];
  const receipt = vi.fn(async () => {
    if (activity.events.some((event) => event.includes('started;'))) activity.permissions = {};
  });
  const local = new LocalCapabilities(
    store,
    () => {},
    {} as any,
    {} as any,
    undefined,
    undefined,
    receipt,
    gateway,
  );
  const signal = new AbortController().signal;
  const call = (phase: string, args = {}) =>
    local.execute(
      activity,
      { name: 'desktop_bridge', callId: 'native-call', arguments: { phase, ...args } },
      signal,
    ) as Promise<any>;
  await call('discover', { work: 'time' });
  const prepared = await call('prepare', { operation: 'timer.start' });
  expect(prepared.requiresApproval).toBe(false);
  expect(await call('execute', { ticket: prepared.ticket })).toMatchObject({
    error: expect.stringContaining('permission changed'),
  });
  expect(execute).not.toHaveBeenCalled();
  expect(await call('execute', { ticket: prepared.ticket })).toMatchObject({
    error: expect.stringContaining('grant'),
  });
});

test('computer use has a separate allow-all grant that can be revoked independently', async () => {
  const execute = vi.fn().mockResolvedValue({ snapshotId: 'snapshot' });
  const gateway = new DesktopGateway([
    {
      operations: () => [
        {
          name: 'computer.observe',
          work: 'computer',
          description: 'Inspect desktop',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          mutates: true,
        },
      ],
      execute,
    },
  ]);
  const store = new Store('/unused');
  vi.spyOn(store, 'save').mockResolvedValue();
  const activity = {
    id: 'chat',
    messages: [],
    events: [],
    permissions: { desktop: true },
  } as unknown as Activity;
  store.state.activities = [activity];
  const local = new LocalCapabilities(
    store,
    () => {},
    {} as any,
    {} as any,
    undefined,
    undefined,
    async () => {},
    gateway,
  );
  const signal = new AbortController().signal;
  const call = (phase: string, args = {}) =>
    local.execute(
      activity,
      { name: 'desktop_bridge', callId: 'computer-call', arguments: { phase, ...args } },
      signal,
    ) as Promise<any>;
  await call('discover', { work: 'computer' });
  const prepared = await call('prepare', {
    operation: 'computer.observe',
    arguments_json: '{}',
  });
  expect(prepared.requiresApproval).toBe(true);
  const decision = local.decideRuntimeApproval(
    activity,
    {
      approval: {
        id: 'computer-approval',
        callId: 'computer-call',
        action: 'dynamic:desktop.execute',
      },
    },
    signal,
  );
  await vi.waitFor(() => expect(activity.approval?.capability).toBe('computer'));
  const html = renderToStaticMarkup(
    React.createElement(ActionApproval, {
      activityId: activity.id,
      approval: activity.approval!,
    }),
  );
  expect(html).toContain('Allow all computer-use actions in this session');
  await local.approve({
    activityId: activity.id,
    approvalId: 'computer-approval',
    approved: true,
    autoAllow: true,
  });
  expect(await decision).toBe(true);
  expect(activity.permissions).toEqual({ desktop: true, computer: true });
  local.grant(activity, { approvalId: 'computer-approval' });
  expect(await call('execute', { ticket: prepared.ticket })).toEqual({
    snapshotId: 'snapshot',
  });

  const next = await call('prepare', {
    operation: 'computer.observe',
    arguments_json: '{}',
  });
  expect(next.requiresApproval).toBe(false);
  await local.setPermission({
    activityId: activity.id,
    capability: 'computer',
    autoAllow: false,
  });
  expect(activity.permissions).toEqual({ desktop: true, computer: false });
  const revoked = await call('prepare', {
    operation: 'computer.observe',
    arguments_json: '{}',
  });
  expect(revoked.requiresApproval).toBe(true);
});
