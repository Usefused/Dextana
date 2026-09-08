import { expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test, reply, start } from './fixture';

test('Plan mode blocks work, persists approval across restart, groups scoped actions, and expires after execution', async ({
  workspace,
}, testInfo) => {
  test.setTimeout(180_000);
  let visits = 0;
  const site = createServer((_req, res) => {
    visits++;
    res.end('<title>Plan research</title><p>Budget: 250</p>');
  });
  await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(site.address() as { port: number }).port}`;
  let file = '';
  let prematureBlocked = false;
  const work = await workspace((body, res) => {
    const user = body.messages.findLastIndex((m: any) => m.role === 'user');
    const prompt = body.messages[user].content;
    const results = body.messages.slice(user + 1).filter((m: any) => m.role === 'tool');
    const call = (name: string, args: object) =>
      reply(body, res, '', [{ function: { name, arguments: args } }]);
    if (prompt.includes('[DEXTANA_PLAN_DRAFT]')) {
      if (!results.length)
        call('browser', { action: 'open', url }); // Intentionally ignore instructions: the host must block it.
      else if (results.length === 1) {
        prematureBlocked = String(results[0].content).includes('Plan mode');
        call('propose_plan', {
          title: 'Prepare the budget report',
          steps: ['Read the budget website.', 'Create the budget document.'],
          browser_urls: [url],
          file_reads: [],
          file_creates: [file],
          mcp_tools: [],
          fused_integrations: [],
        });
      } else reply(body, res, 'Your plan is ready to review.');
    } else if (prompt.includes('[DEXTANA_APPROVED_PLAN]')) {
      if (!results.length) call('browser', { action: 'open', url });
      else if (results.length === 1)
        call('files', { action: 'create', path: file, content: 'Budget: 250' });
      else reply(body, res, 'Created your budget report.');
    } else if (!results.length) call('browser', { action: 'open', url });
    else reply(body, res, 'Finished browsing.');
    return true;
  });
  file = join(work.directory, 'Budget.txt');
  try {
    await work.page.getByLabel('Activity mode', { exact: true }).selectOption('plan');
    await work.page.getByLabel('Describe your work').fill('Plan my budget report');
    await work.page.getByRole('button', { name: 'Start activity', exact: true }).click();
    let plan = work.page.getByRole('region', { name: 'Work plan' }).last();
    await expect(plan.getByRole('button', { name: 'Approve plan and start' })).toBeEnabled({
      timeout: 60_000,
    });
    expect(prematureBlocked).toBe(true);
    expect(visits).toBe(0);
    await expect(readFile(file)).rejects.toThrow();
    await expect(plan).toContainText('Read the budget website.');
    await expect(plan).toContainText(file);
    await work.page.screenshot({ path: testInfo.outputPath('plan-review.png') });
    await work.restart();
    await work.page.getByRole('button', { name: 'Plan my budget report', exact: true }).click();
    plan = work.page.getByRole('region', { name: 'Work plan' }).last();
    await expect(plan.getByRole('button', { name: 'Approve plan and start' })).toBeEnabled();
    await plan.getByRole('button', { name: 'Approve plan and start' }).click();
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', {
      timeout: 60_000,
    });
    await expect(work.page.getByRole('region', { name: 'Action approval' })).toHaveCount(0);
    expect(visits).toBeGreaterThan(0);
    expect(await readFile(file, 'utf8')).toBe('Budget: 250');
    await expect(plan).toContainText('Completed');
    await work.restart();
    await work.page.getByRole('button', { name: 'Plan my budget report', exact: true }).click();
    await expect(work.page.getByRole('region', { name: 'Work plan' })).toContainText('Completed');
    await work.page.getByLabel('Activity mode', { exact: true }).selectOption('work');
    await work.page.getByLabel('Describe your work').fill('Browse again');
    await work.page.getByRole('button', { name: 'Send message', exact: true }).click();
    const gate = work.page.getByRole('region', { name: 'Action approval' });
    await expect(gate).toBeVisible({ timeout: 60_000 });
    const followUp = work.calls.at(-1).messages.findLast((message: any) => message.role === 'user').content;
    expect(followUp).toContain('<saved_plans>');
    expect(followUp).toContain('Read the budget website.');
    await gate.getByRole('button', { name: 'Deny action', exact: true }).click();
    await start(work.page, 'Another chat also needs permission');
    await expect(work.page.getByRole('region', { name: 'Action approval' })).toBeVisible({
      timeout: 60_000,
    });
    await work.page.getByRole('button', { name: 'Deny action', exact: true }).click();
  } finally {
    await work.close();
    site.closeAllConnections();
    await new Promise<void>((resolve) => site.close(() => resolve()));
  }
});

test('plans can be declined and revised, then share selected MCP approval with workers while other tools still ask', async ({
  workspace,
}) => {
  test.setTimeout(180_000);
  const { mcpServer } = await import('./mcp-fixture');
  const server = await mcpServer();
  let connectionId = '';
  const work = await workspace((body, res) => {
    const user = body.messages.findLastIndex((m: any) => m.role === 'user');
    const prompt = body.messages[user].content;
    const results = body.messages.slice(user + 1).filter((m: any) => m.role === 'tool');
    const call = (name: string, args: object) =>
      reply(body, res, '', [{ function: { name, arguments: args } }]);
    if (prompt.includes('[DEXTANA_PLAN_DRAFT]')) {
      if (!results.length)
        call('propose_plan', {
          title: 'Create two review tasks',
          steps: ['Have two workers create the review tasks.'],
          browser_urls: [],
          file_reads: [],
          file_creates: [],
          mcp_tools: [{ server_id: connectionId, tool_name: 'create_task' }],
          fused_integrations: [],
        });
      else reply(body, res, 'Review the proposed plan.');
    } else if (prompt.endsWith('Worker create A') || prompt.endsWith('Worker create B')) {
      if (!results.length)
        call('mcp', {
          action: 'call',
          server_id: connectionId,
          tool_name: 'create_task',
          arguments_json: '{"title":"Review report"}',
        });
      else reply(body, res, 'Task created.');
    } else if (!results.length)
      call('delegate', { tasks: [{ prompt: 'Worker create A' }, { prompt: 'Worker create B' }] });
    else if (results.length === 1)
      call('mcp', {
        action: 'call',
        server_id: connectionId,
        tool_name: 'read_tasks',
        arguments_json: '{}',
      });
    else reply(body, res, 'Done.');
    return true;
  });
  try {
    // Existing integration setup is covered by mcp.spec; this flow tests plan consent.
    connectionId = await work.page.evaluate(async (url) => {
      const id = await window.dextana.saveMCP({
        name: 'Plan tasks',
        transport: 'http',
        url,
        command: '',
        args: [],
        enabled: true,
        token: 'synthetic-mcp-token',
      });
      await window.dextana.testMCP(id);
      await window.dextana.setMCPTools(id, {
        create_task: 'ask',
        read_tasks: 'ask',
        delete_task: 'disabled',
      });
      return id;
    }, server.url);
    await work.page.getByLabel('Activity mode', { exact: true }).selectOption('plan');
    await work.page.getByLabel('Describe your work').fill('Plan review tasks');
    await work.page.getByRole('button', { name: 'Start activity', exact: true }).click();
    const plans = () => work.page.getByRole('region', { name: 'Work plan' });
    await expect(plans().last().getByRole('button', { name: 'Decline plan' })).toBeEnabled({
      timeout: 60_000,
    });
    await plans().last().getByRole('button', { name: 'Decline plan' }).click();
    await expect(plans().first()).toContainText('Declined');
    expect(server.calls).toEqual([]);
    await work.page.getByLabel('Describe your work').fill('Revise the task plan');
    await work.page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(plans()).toHaveCount(2);
    await expect(
      plans().last().getByRole('button', { name: 'Approve plan and start' }),
    ).toBeEnabled();
    await work.page.getByLabel('Describe your work').fill('Make the plan smaller');
    await work.page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(plans()).toHaveCount(3);
    await expect(plans().nth(1)).toContainText('Replaced by a newer request');
    await expect(plans().last()).toContainText('Plan tasks · create_task');
    await expect(
      plans().last().getByRole('button', { name: 'Approve plan and start' }),
    ).toBeEnabled();
    expect(server.calls).toEqual([]);
    await plans().last().getByRole('button', { name: 'Approve plan and start' }).click();
    const gate = work.page.getByRole('region', { name: 'Action approval' });
    await expect(gate).toContainText('read_tasks', { timeout: 60_000 });
    expect(server.calls).toEqual(['create_task', 'create_task']);
    const snapshot = await work.page.evaluate(() => window.dextana.snapshot());
    const children = snapshot.activities.filter(
      (a) => a.title === 'Worker create A' || a.title === 'Worker create B',
    );
    expect(children).toHaveLength(2);
    expect(
      children.every(
        (a) =>
          a.status === 'completed' &&
          a.events.some((event) => event.includes('covered by approved plan')),
      ),
    ).toBe(true);
    expect(
      snapshot
        .mcpConnections!.find((c) => c.id === connectionId)!
        .tools.find((t) => t.name === 'create_task')!.policy,
    ).toBe('ask');
    await gate.getByRole('button', { name: 'Deny action', exact: true }).click();
    await expect(work.page.getByTestId('activity-status')).toHaveText('Cancelled');
    await expect(plans().last()).toContainText('Stopped');
    expect(server.calls).not.toContain('read_tasks');
  } finally {
    if (connectionId) await work.page.evaluate((id) => window.dextana.removeMCP(id), connectionId);
    await work.close();
    await server.close();
  }
});

test('a website redirect outside the approved plan cannot contact its target before permission', async ({
  workspace,
}) => {
  test.setTimeout(120_000);
  let outsideVisits = 0;
  const outside = createServer((_req, res) => {
    outsideVisits++;
    res.end('<title>Another website</title>');
  });
  await new Promise<void>((resolve) => outside.listen(0, '127.0.0.1', resolve));
  const destination = `http://127.0.0.1:${(outside.address() as { port: number }).port}/other`;
  const origin = createServer((_req, res) => {
    res.writeHead(302, { Location: destination });
    res.end();
  });
  await new Promise<void>((resolve) => origin.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(origin.address() as { port: number }).port}/redirect`;
  let blocked = false;
  const work = await workspace((body, res) => {
    const user = body.messages.findLastIndex((m: any) => m.role === 'user');
    const prompt = body.messages[user].content;
    const results = body.messages.slice(user + 1).filter((m: any) => m.role === 'tool');
    const call = (name: string, args: object) =>
      reply(body, res, '', [{ function: { name, arguments: args } }]);
    if (prompt.includes('[DEXTANA_PLAN_DRAFT]')) {
      if (!results.length)
        call('propose_plan', {
          title: 'Read the website',
          steps: ['Read the supplied website.'],
          browser_urls: [url],
          file_reads: [],
          file_creates: [],
          mcp_tools: [],
          fused_integrations: [],
        });
      else reply(body, res, 'Plan ready.');
    } else if (!results.length) call('browser', { action: 'open', url });
    else if (results.length === 1) {
      blocked = String(results[0].content).includes('outside the approved plan');
      call('browser', { action: 'open', url: destination });
    } else reply(body, res, 'Read the additional website after your permission.');
    return true;
  });
  try {
    await work.page.getByLabel('Activity mode', { exact: true }).selectOption('plan');
    await work.page.getByLabel('Describe your work').fill('Plan website research');
    await work.page.getByRole('button', { name: 'Start activity', exact: true }).click();
    const plan = work.page.getByRole('region', { name: 'Work plan' });
    await expect(plan.getByRole('button', { name: 'Approve plan and start' })).toBeEnabled({
      timeout: 60_000,
    });
    await plan.getByRole('button', { name: 'Approve plan and start' }).click();
    const gate = work.page.getByRole('region', { name: 'Action approval' });
    await expect(gate).toContainText(destination, { timeout: 60_000 });
    expect(blocked).toBe(true);
    expect(outsideVisits).toBe(0);
    await gate.getByRole('button', { name: 'Allow action', exact: true }).click();
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed');
    expect(outsideVisits).toBeGreaterThan(0);
  } finally {
    await work.close();
    origin.closeAllConnections();
    outside.closeAllConnections();
    await Promise.all([
      new Promise<void>((resolve) => origin.close(() => resolve())),
      new Promise<void>((resolve) => outside.close(() => resolve())),
    ]);
  }
});
