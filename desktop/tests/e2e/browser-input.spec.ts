import { expect } from '@playwright/test';
import { createServer } from 'node:http';
import { test, start, reply, allowBrowser } from './fixture';

test('browser focuses custom inputs and sends real pointer and input events', async ({ workspace }) => {
  test.setTimeout(120_000);
  const site = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<input aria-label="Search"><button>Find</button><p id="result"></p><script>
      let query = '', pressed = false;
      const input = document.querySelector('input'), button = document.querySelector('button');
      input.addEventListener('input', e => { if (e.isTrusted && document.activeElement === input) query = input.value; });
      button.addEventListener('pointerdown', e => { pressed = e.isTrusted; });
      button.addEventListener('click', e => { if (pressed && e.isTrusted) document.querySelector('#result').textContent = 'Found: ' + query; });
    </script>`);
  });
  await new Promise<void>(resolve => site.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(site.address() as { port: number }).port}/`;
  const work = await workspace((body, res) => {
    const results = body.messages.filter((m: any) => m.role === 'tool');
    const steps = [{ action: 'open', url }, { action: 'fill', ref: '1', text: 'Project notes' }, { action: 'click', ref: '2' }, { action: 'read' }];
    if (results.length < steps.length) reply(body, res, '', [{ function: { name: 'browser', arguments: steps[results.length] } }]);
    else reply(body, res, JSON.stringify(results.at(-1).content));
    return true;
  });
  try {
    await start(work.page, 'Search the custom controls');
    await allowBrowser(work.page);
    await expect(work.page.getByTestId('assistant-message').last()).toContainText('Found: Project notes', { timeout: 60_000 });
  } finally {
    await work.close(); site.closeAllConnections();
    await new Promise<void>(resolve => site.close(() => resolve()));
  }
});
