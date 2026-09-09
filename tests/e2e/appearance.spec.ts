import { expect } from '@playwright/test';
import { test, start, reply } from './fixture';
import { createServer } from 'node:http';

test('dark appearance keeps a working chat and its settings readable', async ({ workspace }, info) => {
  const server = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end('<body style="background:white;color:black;font-family:system-ui;padding:24px"><h1>Work document</h1><p>This website controls its own colors.</p></body>');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
  const work = await workspace((body, res) => {
    const user = body.messages.findLastIndex((message: any) => message.role === 'user');
    if (body.messages[user]?.content.includes('Open browser') && !body.messages.slice(user + 1).some((message: any) => message.role === 'tool')) {
      reply(body, res, '', [{ function: { name: 'browser', arguments: { action: 'open', url } } }]);
      return true;
    }
    reply(body, res, '## Weekly report\n\nThe report is ready.\n\n| Task | Status |\n| --- | --- |\n| Review invoices | Complete |\n\n> Saved for your review.\n\nUse `invoices.csv` for the next step.');
    return true;
  });
  try {
    await work.page.getByRole('button', { name: 'Settings', exact: true }).click();
    await work.page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'Appearance', exact: true }).click();
    await work.page.getByLabel('Color theme').selectOption('dark');
    await expect(work.page.getByRole('status')).toContainText('Appearance saved');
    await start(work.page, 'Summarize the weekly report');
    await expect(work.page.getByTestId('assistant-message')).toContainText('Saved for your review.');
    await expect(work.page.getByRole('table')).toContainText('Complete');
    const luminance = (color: string) => {
      const rgb = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(value => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    };
    expect(luminance(await work.page.locator('.sidebar').evaluate(el => getComputedStyle(el).backgroundColor))).toBeLessThan(0.05);
    // Body copy, muted copy, and input text must retain contrast on dark surfaces.
    const colors = await work.page.evaluate(() => {
      const canvas = getComputedStyle(document.documentElement).backgroundColor;
      return [
        { text: getComputedStyle(document.querySelector('.composer textarea')!).color, surface: getComputedStyle(document.querySelector('.composer')!).backgroundColor },
        { text: getComputedStyle(document.querySelector('.eyebrow')!).color, surface: canvas },
        { text: getComputedStyle(document.querySelector('.markdown')!).color, surface: canvas },
      ];
    });
    for (const { text, surface } of colors) {
      const foreground = luminance(text), background = luminance(surface);
      expect((Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
    await work.page.screenshot({ path: info.outputPath('dark-chat.png') });
    await work.page.getByRole('button', { name: 'Settings', exact: true }).click();
    await work.page.getByRole('navigation', { name: 'Settings sections' }).getByRole('button', { name: 'Connectors', exact: true }).click();
    await work.page.screenshot({ path: info.outputPath('dark-connections.png') });
    await start(work.page, 'Open browser to the work document');
    const gate = work.page.getByRole('region', { name: 'Action approval' });
    await expect(gate).toBeVisible();
    await work.page.screenshot({ path: info.outputPath('dark-approval.png') });
    await gate.getByRole('button', { name: 'Allow action', exact: true }).click();
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed');
    await expect.poll(() => work.app().evaluate(async ({ webContents }, address) => {
      const view = webContents.getAllWebContents().find(contents => contents.getURL() === address);
      return view?.executeJavaScript('getComputedStyle(document.body).backgroundColor');
    }, url)).toBe('rgb(255, 255, 255)');
    await work.page.screenshot({ path: info.outputPath('dark-browser.png') });
  } finally {
    await work.page.evaluate(() => window.dextana.setTheme('system'));
    await work.close();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
