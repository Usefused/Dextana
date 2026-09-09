import { expect } from '@playwright/test';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test, start, reply } from './fixture';

function desktopCall(
  body: any,
  response: any,
  action: string,
  work: string,
  operation = '',
  args: object = {},
) {
  reply(body, response, '', [
    {
      function: {
        name: 'desktop',
        arguments: { action, work, operation, arguments_json: JSON.stringify(args) },
      },
    },
  ]);
}

test('desktop rename previews are approved through Harnest, appear in context, and can be undone after restart', async ({
  workspace,
}) => {
  test.setTimeout(120_000);
  let path = '';
  let previewId = '';
  let toolNames: string[] = [];
  const work = await workspace((body, response) => {
    toolNames = (body.tools ?? []).map((tool: any) => tool.function.name);
    const latest = body.messages.findLastIndex((message: any) => message.role === 'user');
    const prompt = body.messages[latest].content;
    const results = body.messages
      .slice(latest + 1)
      .filter((message: any) => message.role === 'tool');
    if (!results.length) desktopCall(body, response, 'discover', 'workflows');
    else if (results.length === 1)
      desktopCall(
        body,
        response,
        'call',
        'workflows',
        prompt.includes('Apply') ? 'workflow.rename_apply' : 'workflow.rename_preview',
        prompt.includes('Apply')
          ? { id: previewId }
          : { entries: [{ from: path, name: '2026-Supplier.txt' }] },
      );
    else {
      const receipt = String(results.at(-1).content);
      if (!prompt.includes('Apply')) previewId = receipt.match(/"id"\s*:\s*"([^"]+)"/)?.[1] ?? '';
      reply(body, response, 'Desktop result: ' + receipt);
    }
    return true;
  });
  try {
    path = join(work.directory, 'receipt.txt');
    const renamed = join(work.directory, '2026-Supplier.txt');
    await writeFile(path, 'Invoice 42');
    await start(work.page, 'Preview a desktop rename for my receipt');
    const gate = () => work.page.getByRole('region', { name: 'Action approval' });
    await expect(gate()).toContainText('receipt.txt', { timeout: 60_000 });
    await gate().getByRole('button', { name: 'Allow action', exact: true }).click();
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', {
      timeout: 60_000,
    });
    expect(toolNames).toContain('desktop');
    expect(toolNames).not.toContain('workflow.rename_apply');
    expect(previewId).not.toBe('');
    const desktopContext = work.page.getByRole('region', { name: 'Agent context' });
    await desktopContext
      .locator('summary')
      .filter({ hasText: /^Desktop/ })
      .click();
    await expect(desktopContext.getByRole('region', { name: 'Desktop in context' })).toContainText(
      'Rename 1 files',
    );
    expect(await readFile(path, 'utf8')).toBe('Invoice 42');
    await expect(access(renamed)).rejects.toThrow();
    await work.page.getByLabel('Describe your work').fill('Apply the reviewed desktop rename');
    await work.page.getByRole('button', { name: 'Send message' }).click();
    await expect(gate()).toContainText('receipt.txt', { timeout: 60_000 });
    await expect(gate()).toContainText('2026-Supplier.txt');
    await gate().getByRole('button', { name: 'Allow action', exact: true }).click();
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', {
      timeout: 60_000,
    });
    expect(await readFile(renamed, 'utf8')).toBe('Invoice 42');
    await expect(access(path)).rejects.toThrow();
    await work.page.getByLabel('Workspace view').selectOption('desktop');
    await work.page.getByRole('button', { name: 'Workflows', exact: true }).click();
    const batch = () =>
      work.page
        .getByRole('article', { name: 'Rename 1 files', exact: true })
        .filter({ hasText: '2026-Supplier.txt' });
    await expect(batch()).toContainText('applied');
    await work.page.screenshot({
      path: '/private/tmp/dextana-workflows-shared-ui.png',
      fullPage: true,
    });
    await work.restart();
    await work.page.getByLabel('Workspace view').selectOption('desktop');
    await work.page.getByRole('button', { name: 'Workflows', exact: true }).click();
    await expect(batch()).toContainText('applied');
    await batch().getByRole('button', { name: 'Review undo', exact: true }).click();
    await expect(batch().getByRole('table', { name: 'Rename preview' })).toContainText(
      '2026-Supplier.txt',
    );
    await batch().getByRole('button', { name: 'Confirm undo', exact: true }).click();
    await expect(batch()).toContainText('undone');
    expect(await readFile(path, 'utf8')).toBe('Invoice 42');
    await expect(access(renamed)).rejects.toThrow();
  } finally {
    await work.close();
  }
});

test('desktop local indexing produces a document and a watched folder dispatches scoped Harnest work once', async ({
  workspace,
}) => {
  test.setTimeout(150_000);
  let folder = '';
  let input = '';
  let output = '';
  let watchRuns = 0;
  const work = await workspace((body, response) => {
    const latest = body.messages.findLastIndex((message: any) => message.role === 'user');
    const prompt = String(body.messages[latest].content);
    const results = body.messages
      .slice(latest + 1)
      .filter((message: any) => message.role === 'tool');
    if (prompt.includes('INBOX-WORKFLOW-TEST')) {
      watchRuns++;
      reply(body, response, 'Finished processing the watched arrival.');
      return true;
    }
    const watching = prompt.includes('Watch');
    const category = watching ? 'workflows' : 'processing';
    if (!results.length) desktopCall(body, response, 'discover', category);
    else if (results.length === 1)
      desktopCall(
        body,
        response,
        'call',
        category,
        watching ? 'workflow.watch_save' : 'processing.start',
        watching
          ? {
              name: 'Test invoice inbox',
              folder,
              prompt: 'INBOX-WORKFLOW-TEST: summarise the attached new files.',
              extensions: ['txt'],
            }
          : { kind: 'index', paths: [input], outputPath: output },
      );
    else reply(body, response, 'Desktop result: ' + results.at(-1).content);
    return true;
  });
  try {
    folder = join(work.directory, 'inbox');
    await mkdir(folder);
    input = join(folder, 'brief.txt');
    output = join(work.directory, 'local-index.json');
    await writeFile(input, 'A local invoice from Supplier 42.');
    await start(work.page, 'Index my brief using local desktop processing');
    const gate = () => work.page.getByRole('region', { name: 'Action approval' });
    await expect(gate()).toContainText('local-index.json', { timeout: 60_000 });
    await gate().getByRole('button', { name: 'Allow action', exact: true }).click();
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', {
      timeout: 60_000,
    });
    await work.page.getByLabel('Workspace view').selectOption('desktop');
    await work.page.getByRole('button', { name: 'Workflows', exact: true }).click();
    await expect(
      work.page.getByRole('article', { name: 'index local-index.json', exact: true }),
    ).toContainText('completed', { timeout: 30_000 });
    expect(await readFile(output, 'utf8')).toContain('Supplier 42');
    await start(work.page, 'Watch my invoice inbox for new desktop files');
    await expect(gate()).toContainText('Test invoice inbox', { timeout: 60_000 });
    await expect(gate()).toContainText('Watch a folder');
    await expect(gate()).not.toContainText('workflow.watch_save');
    await expect(gate()).not.toContainText('activityId');
    await gate().getByRole('button', { name: 'Allow action', exact: true }).click();
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', {
      timeout: 60_000,
    });
    const contextPanel = work.page.getByRole('region', { name: 'Agent context' });
    const desktopGroup = contextPanel
      .locator('details')
      .filter({ has: work.page.locator('summary').filter({ hasText: /^Desktop/ }) });
    await desktopGroup.locator('summary').click();
    await expect(desktopGroup).toContainText(folder);
    await expect(work.page.getByTestId('assistant-message').last()).not.toContainText('"folder"');
    expect(watchRuns).toBe(0);
    await writeFile(join(folder, 'arrival.txt'), 'New invoice 84');
    await expect.poll(() => watchRuns, { timeout: 30_000 }).toBe(1);
    await work.page.getByLabel('Workspace view').selectOption('desktop');
    await work.page.getByRole('button', { name: 'Workflows', exact: true }).click();
    const rule = work.page.getByRole('article', { name: 'Test invoice inbox', exact: true });
    await expect(rule).toContainText('watching', { timeout: 30_000 });
    await expect(rule).toContainText('0 pending');
    await rule.getByRole('button', { name: 'Remove watch', exact: true }).click();
    await expect(rule).toHaveCount(0);
  } finally {
    await work.close();
  }
});
