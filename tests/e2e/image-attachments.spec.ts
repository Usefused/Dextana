import { expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test, start, reply } from './fixture';

const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMZsAAAAASUVORK5CYII=';
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
