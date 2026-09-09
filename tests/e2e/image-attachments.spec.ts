import { expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test, start, reply } from './fixture';

const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMZsAAAAASUVORK5CYII=';

test('model discovery distinguishes an outdated desktop from a provider with no vision models', async ({ workspace }) => {
  const work = await workspace();
  try {
    await work.page.getByRole('button', { name: 'Settings', exact: true }).click();
    await work.app().evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('modelCatalog');
      ipcMain.handle('modelCatalog', () => ({ chat: ['qwen3:8b', 'llama3.2:3b'], embedding: [] }));
    });
    await work.page.getByRole('button', { name: 'Connect to Ollama', exact: true }).click();
    await expect(work.page.getByRole('alert')).toContainText('Restart Dextana');
    await expect(work.page.getByText('This connection did not report any image-capable models.', { exact: false })).toHaveCount(0);
    await work.restart();
    await work.page.getByRole('button', { name: 'Settings', exact: true }).click();
    await work.page.getByRole('button', { name: 'Connect to Ollama', exact: true }).click();
    const interpreter = work.page.getByLabel('Image interpreter', { exact: true });
    await expect(interpreter.locator('option')).toHaveText([
      'Use the selected chat model', 'qwen3:8b', 'Enter a model ID manually…',
    ]);
  } finally {
    await work.close();
  }
});

test('images attach from Files and Context and reach the model only after read approval', async ({
  workspace,
}) => {
  test.setTimeout(120_000);
  let path = '';
  const work = await workspace((body, res) => {
    if (body.messages.some((m: any) => m.images?.length))
      reply(body, res, 'The attached image is available for visual analysis.');
    else if (body.messages.some((m: any) => m.role === 'tool'))
      reply(
        body,
        res,
        'Image read failed: ' + body.messages.filter((m: any) => m.role === 'tool').at(-1).content,
      );
    else
      reply(body, res, '', [{ function: { name: 'files', arguments: { action: 'read', path } } }]);
    return true;
  });
  try {
    path = join(work.directory, 'Reference image.png');
    await writeFile(path, Buffer.from(png, 'base64'));
    await work.page.getByRole('button', { name: 'New activity', exact: true }).click();
    await work.app().evaluate(({ dialog }, filePath) => {
      (globalThis as any).__attachmentDialog = dialog.showOpenDialog;
      dialog.showOpenDialog = async (...args: any[]) => {
        const options = args.at(-1);
        if (!options.filters.some((f: any) => f.extensions.includes('png')))
          throw new Error('Image picker filter missing');
        return { canceled: false, filePaths: [filePath] };
      };
    }, path);
    await work.page.getByRole('button', { name: 'Attach files', exact: true }).click();
    await expect(
      work.page.getByRole('region', { name: 'Attached files', exact: true }),
    ).toContainText('Reference image.png');
    await work.page.getByLabel('Describe your work').fill('Inspect my attached image');
    await work.page.getByRole('button', { name: 'Start activity', exact: true }).click();
    const gate = work.page.getByRole('region', { name: 'Action approval' });
    await expect(gate).toBeVisible({ timeout: 60_000 });
    expect(JSON.stringify(work.calls)).not.toContain(png);
    await gate.getByRole('button', { name: 'Allow action', exact: true }).click();
    await expect(work.page.getByTestId('assistant-message')).toContainText(
      'available for visual analysis',
      { timeout: 60_000 },
    );
    expect(work.calls.some((body) => body.messages.some((m: any) => m.images?.includes(png)))).toBe(
      true,
    );
    const second = join(work.directory, 'Context image.png');
    await writeFile(second, Buffer.from(png, 'base64'));
    await work.app().evaluate(({ dialog }, filePath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
    }, second);
    const panel = work.page.getByRole('region', { name: 'Agent context', exact: true });
    await panel.locator('summary').filter({ has: work.page.getByRole('button', { name: 'Attach context files' }) }).hover();
    await panel.getByRole('button', { name: 'Attach context files' }).click();
    await expect(panel).toContainText('Context image.png');
    await start(work.page, 'Read my image with a text-only model', 'llama3.2:3b');
    await expect(work.page.getByTestId('assistant-message')).toContainText(
      'Choose a vision-capable model',
      { timeout: 60_000 },
    );
    await work.restart();
    await work.page.getByRole('button', { name: 'Inspect my attached image', exact: true }).click();
    await work.page.getByRole('searchbox', { name: 'Search context' }).fill('Context image');
    await expect(
      work.page.getByRole('region', { name: 'Agent context', exact: true }),
    ).toContainText('Context image.png');
  } finally {
    await work.app().evaluate(({ dialog }) => {
      if ((globalThis as any).__attachmentDialog)
        dialog.showOpenDialog = (globalThis as any).__attachmentDialog;
    });
    await work.close();
  }
});

test('a configured image interpreter lets a text-only chat model understand approved images', async ({
  workspace,
}) => {
  test.setTimeout(120_000);
  let path = '';
  const work = await workspace((body, res) => {
    if (body.messages.some((m: any) => m.images?.length))
      reply(body, res, 'The image shows a blue square labelled Demo.');
    else if (JSON.stringify(body.messages).includes('Image interpreter observations'))
      reply(body, res, 'The interpreter reports a blue square labelled Demo.');
    else
      reply(body, res, '', [{ function: { name: 'files', arguments: { action: 'read', path } } }]);
    return true;
  });
  try {
    path = join(work.directory, 'Interpreter image.png');
    await writeFile(path, Buffer.from(png, 'base64'));
    await work.page.getByRole('button', { name: 'Settings', exact: true }).click();
    await work.page.getByRole('button', { name: 'Connect to Ollama', exact: true }).click();
    await work.page.getByLabel('Image interpreter', { exact: true }).selectOption('model:qwen3:8b');
    await work.page.getByRole('button', { name: 'Save settings', exact: true }).click();
    await work.restart();
    expect(
      (await work.page.evaluate(() => window.dextana.snapshot())).settings.imageInterpreterModel,
    ).toBe('qwen3:8b');
    const startIndex = work.calls.length;
    await start(work.page, 'Interpret my image using the configured interpreter', 'llama3.2:3b');
    const gate = work.page.getByRole('region', { name: 'Action approval' });
    await expect(gate).toBeVisible({ timeout: 60_000 });
    expect(JSON.stringify(work.calls.slice(startIndex))).not.toContain(png);
    await gate.getByRole('button', { name: 'Allow action', exact: true }).click();
    await expect(work.page.getByTestId('assistant-message')).toContainText(
      'blue square labelled Demo',
      { timeout: 60_000 },
    );
    const imageCalls = work.calls
      .slice(startIndex)
      .filter((body) => body.messages.some((m: any) => m.images?.length));
    expect(imageCalls).toHaveLength(1);
    expect(imageCalls[0].model).toBe('qwen3:8b');
    expect(
      work.calls
        .slice(startIndex)
        .filter((body) => body.model === 'llama3.2:3b')
        .every((body) => !body.messages.some((m: any) => m.images?.length)),
    ).toBe(true);
  } finally {
    await work.close();
  }
});
