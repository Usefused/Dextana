import { expect, test } from 'vitest';
import { DesktopGateway } from '../../src/main/desktop/gateway';
import type { DesktopOperation } from '../../src/shared/desktop';

test('desktop discovery is scoped to work and chat, expires on release, and never authorizes another operation', async () => {
  const operations: DesktopOperation[] = [
    { name: 'timer.start', work: 'time', description: 'Timer', inputSchema: {}, mutates: true },
    { name: 'file.open', work: 'files', description: 'Open', inputSchema: {}, mutates: true },
  ];
  const gateway = new DesktopGateway([
    { operations: () => operations, execute: async () => ({ ok: true }) },
  ]);
  const context = { activityId: 'first' };
  expect(gateway.discover(context, 'time').operations?.map((item) => item.name)).toEqual([
    'timer.start',
  ]);
  const request = { action: 'call' as const, operation: 'timer.start' };
  await expect(gateway.prepare({ activityId: 'second' }, request)).rejects.toThrow('not loaded');
  const plan = await gateway.prepare(context, request);
  const abort = new AbortController();
  abort.abort();
  await expect(plan.execute(abort.signal)).rejects.toThrow();
  gateway.discover(context, 'files');
  await expect(gateway.prepare(context, request)).rejects.toThrow('not loaded');
  gateway.release(context.activityId);
  await expect(
    gateway.prepare(context, { action: 'call', operation: 'file.open' }),
  ).rejects.toThrow('not loaded');
});

test('capability changes invalidate prepared calls and callers cannot replace chat ownership', async () => {
  const operation: DesktopOperation = {
    name: 'file.open',
    work: 'files',
    description: 'Open',
    inputSchema: {},
    mutates: true,
  };
  const gateway = new DesktopGateway([
    { operations: () => [operation], execute: async () => ({ ok: true }) },
  ]);
  const context = { activityId: 'first' };
  gateway.discover(context, 'files');
  await expect(
    gateway.prepare(context, {
      action: 'call',
      operation: 'file.open',
      arguments_json: '{"activityId":"another"}',
    }),
  ).rejects.toThrow('originating chat');
  const plan = await gateway.prepare(context, { action: 'call', operation: 'file.open' });
  operation.description = 'Changed';
  await expect(plan.execute(new AbortController().signal)).rejects.toThrow('changed');
});

test('review data cannot change prepared arguments and released chats cannot execute old plans', async () => {
  const calls: unknown[] = [];
  const gateway = new DesktopGateway([
    {
      operations: () => [
        {
          name: 'timer.start',
          work: 'time',
          description: 'Start',
          inputSchema: {
            type: 'object',
            properties: { title: { type: 'string' } },
            required: ['title'],
            additionalProperties: false,
          },
          mutates: true,
        },
      ],
      preview: async (_operation, args) => {
        args.title = 'Preview changed';
        return args;
      },
      execute: async (_operation, args) => {
        calls.push(args);
        return args;
      },
    },
  ]);
  const context = { activityId: 'first' };
  gateway.discover(context, 'time');
  const request = {
    action: 'call' as const,
    operation: 'timer.start',
    arguments_json: '{"title":"Original"}',
  };
  const plan = await gateway.prepare(context, request);
  (plan.details as Record<string, unknown>).title = 'UI changed';
  expect(await plan.execute(new AbortController().signal)).toEqual({ title: 'Original' });
  const expired = await gateway.prepare(context, request);
  gateway.release(context.activityId);
  await expect(expired.execute(new AbortController().signal)).rejects.toThrow('not loaded');
  expect(calls).toHaveLength(1);
});

test('desktop input validation checks nested required properties, ranges, and UTF-8 byte limits', async () => {
  const gateway = new DesktopGateway([
    {
      operations: () => [
        {
          name: 'timer.start',
          work: 'time',
          description: 'Start',
          inputSchema: {
            type: 'object',
            required: ['items'],
            additionalProperties: false,
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['constructor', 'duration'],
                  additionalProperties: false,
                  properties: {
                    constructor: { type: 'string' },
                    duration: { type: 'number', exclusiveMinimum: 0, maximum: 60 },
                  },
                },
              },
            },
          },
          mutates: true,
        },
      ],
      execute: async () => ({}),
    },
  ]);
  const context = { activityId: 'first' };
  gateway.discover(context, 'time');
  const prepare = (args: unknown) =>
    gateway.prepare(context, {
      action: 'call',
      operation: 'timer.start',
      arguments_json: JSON.stringify(args),
    });
  await expect(prepare({ items: [{ duration: 1 }] })).rejects.toThrow('constructor is required');
  await expect(prepare({ items: [{ constructor: 'valid', duration: 0 }] })).rejects.toThrow(
    'range',
  );
  await expect(prepare({ items: [{ constructor: 'valid', duration: 61 }] })).rejects.toThrow(
    'range',
  );
  await expect(
    prepare({ items: [{ constructor: 'valid', duration: 1, extra: true }] }),
  ).rejects.toThrow('not supported');
  await expect(
    prepare({ items: [{ constructor: '🌱'.repeat(30_000), duration: 1 }] }),
  ).rejects.toThrow('100 KB');
  await expect(prepare({ items: [{ constructor: 'valid', duration: 1 }] })).resolves.toBeDefined();
});
