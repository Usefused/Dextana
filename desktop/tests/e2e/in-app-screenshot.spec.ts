import { expect } from '@playwright/test';
import { createServer } from 'node:http';
import { test, start, reply, allowBrowser } from './fixture';

function screenshot(value: any): any {
  if (typeof value === 'string') {
    try {
      return screenshot(JSON.parse(value));
    } catch {
      return;
    }
  }
  if (!value || typeof value !== 'object') return;
  if (value.screenshot_id) return value;
  for (const child of Object.values(value)) {
    const found = screenshot(child);
    if (found) return found;
  }
}

for (const interpreter of [false, true])
  test(`in-app screenshot targeting at zoom with interpreter=${interpreter}`, async ({
    workspace,
  }) => {
    test.setTimeout(100_000);
    const events: any[] = [];
    const site = createServer((req, res) => {
      if (req.url?.startsWith('/event?')) {
        events.push(JSON.parse(decodeURIComponent(req.url.slice(7))));
        return res.end('ok');
      }
      res.setHeader('Content-Type', 'text/html');
      res.end(`<!doctype html><title>Visual fixture</title><style>canvas{position:fixed;left:calc(50% - 40px);top:calc(50% - 30px);background:green}</style><canvas width="80" height="60"></canvas><script>
    document.querySelector('canvas').onclick=e=>fetch('/event?'+encodeURIComponent(JSON.stringify({x:e.clientX,y:e.clientY,width:innerWidth,height:innerHeight,trusted:e.isTrusted})));</script>`);
    });
    await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(site.address() as { port: number }).port}/`;
    let step = 0,
      interpreted = false;
    let captured: any;
    const work = await workspace((body, res) => {
      if (
        body.messages.some((m: any) =>
          String(m.content).includes('Describe the supplied image accurately'),
        )
      ) {
        interpreted = body.messages.some((m: any) =>
          String(m.content).includes('Target x/y are normalized fractions'),
        );
        reply(
          body,
          res,
          JSON.stringify({
            observations: 'Green canvas in center',
            targets: [{ label: 'Green canvas', x: 0.5, y: 0.5, confidence: 'high' }],
          }),
        );
        return true;
      }
      const tool = body.messages.filter((m: any) => m.role === 'tool').at(-1);
      if (step === 3) captured = screenshot(tool?.content);
      const sequence = [
        { action: 'open', url },
        null,
        { action: 'screenshot' },
        () => ({
          action: 'click',
          screenshot_id: captured?.screenshot_id,
          coordinate_space: 'normalized',
          x: 0.5,
          y: 0.5,
        }),
        null,
      ];
      const action = sequence[step++];
      if (action)
        reply(body, res, '', [
          {
            function: {
              name: 'browser',
              arguments: typeof action === 'function' ? action() : action,
            },
          },
        ]);
      else reply(body, res, step === 2 ? 'Visual page ready.' : 'Visual click completed.');
      return true;
    });
    try {
      if (interpreter) {
        await work.page.getByRole('button', { name: 'Settings', exact: true }).click();
        await work.page.getByRole('button', { name: 'Connect to Ollama', exact: true }).click();
        await work.page
          .getByLabel('Image interpreter', { exact: true })
          .selectOption('model:qwen3:8b');
        await work.page.getByRole('button', { name: 'Save settings' }).click();
        await work.page.getByRole('button', { name: 'Back to chats' }).click();
      }
      await start(work.page, 'Open the visual fixture', interpreter ? 'llama3.2:3b' : 'qwen3:8b');
      await allowBrowser(work.page);
      await expect(work.page.getByTestId('assistant-message').last()).toHaveText(
        'Visual page ready.',
      );
      await work.app().evaluate(({ webContents }, url) => {
        const target = webContents.getAllWebContents().find((c) => c.getURL() === url);
        if (!target) throw new Error('Fixture tab not found');
        target.setZoomFactor(1.5);
      }, url);
      await work.page
        .getByLabel('Describe your work')
        .fill('Click the green canvas from a screenshot.');
      await work.page.getByRole('button', { name: 'Send message' }).click();
      await expect(work.page.getByTestId('assistant-message').last()).toHaveText(
        'Visual click completed.',
        { timeout: 60_000 },
      );
      expect(captured?.screenshot_size.width).toBeGreaterThan(captured?.viewport.width);
      await expect.poll(() => events.length).toBe(1);
      expect(events[0].trusted).toBe(true);
      expect(Math.abs(events[0].x - events[0].width / 2)).toBeLessThanOrEqual(1);
      expect(Math.abs(events[0].y - events[0].height / 2)).toBeLessThanOrEqual(1);
      if (interpreter) {
        expect(interpreted).toBe(true);
        expect(
          work.calls.some((body) =>
            JSON.stringify(body.messages).includes('visual estimates, not verified elements'),
          ),
        ).toBe(true);
      }
    } finally {
      if (interpreter)
        await work.page.evaluate(async () => {
          const { settings } = await window.dextana.snapshot();
          await window.dextana.saveSettings({ ...settings, imageInterpreterModel: undefined });
        });
      await work.close();
      site.closeAllConnections();
      await new Promise<void>((resolve) => site.close(() => resolve()));
    }
  });
