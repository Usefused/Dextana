import { expect } from '@playwright/test';
import { createServer } from 'node:http';
import { test, start, reply, allowBrowser } from './fixture';

function snapshot(value: any): any {
  if (typeof value === 'string') {
    try {
      return snapshot(JSON.parse(value));
    } catch {
      return;
    }
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value.elements)) return value;
  for (const child of Object.values(value)) {
    const page = snapshot(child);
    if (page) return page;
  }
}

test('a progressing activity completes more than forty browser actions', async ({ workspace }) => {
  test.setTimeout(150_000);
  const site = createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><title>Long workflow</title>
      <button>Complete step 1</button><p>Completed 0 steps</p>
      <script>let step=0; document.querySelector('button').onclick=e=>{
        if(!e.isTrusted)return;
        document.querySelector('p').textContent='Completed '+(++step)+' steps';
        document.querySelector('button').textContent='Complete step '+(step+1);
      };</script>`);
  });
  await new Promise<void>((resolve) => site.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(site.address() as { port: number }).port}/`;
  let completed = 0;
  const work = await workspace((body, response) => {
    const results = body.messages.filter((message: any) => message.role === 'tool');
    if (!results.length) {
      reply(body, response, '', [
        { function: { name: 'browser', arguments: { action: 'open', url } } },
      ]);
      return true;
    }
    const page = snapshot(results.at(-1).content);
    expect(page?.text).toContain(`Completed ${results.length - 1} steps`);
    completed = results.length - 1;
    if (completed === 45) reply(body, response, 'All 45 steps completed.');
    else {
      const button = page.elements.find((element: any) => element.role === 'button');
      reply(body, response, '', [
        { function: { name: 'browser', arguments: { action: 'click', ref: button.ref } } },
      ]);
    }
    return true;
  });
  try {
    // The scripted provider verifies browser work, not compaction-model requests.
    work.setContextWindow(1_000_000);
    await work.restart();
    await start(work.page, 'Complete the 45-step fixture workflow');
    await allowBrowser(work.page);
    await expect(work.page.getByTestId('assistant-message').last()).toHaveText(
      'All 45 steps completed.',
      { timeout: 100_000 },
    );
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed');
    expect(completed).toBe(45);
  } finally {
    work.setContextWindow(32768);
    await work.restart();
    await work.close();
    site.closeAllConnections();
    await new Promise<void>((resolve) => site.close(() => resolve()));
  }
});
