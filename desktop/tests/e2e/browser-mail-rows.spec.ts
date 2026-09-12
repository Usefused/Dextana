import { expect } from '@playwright/test';
import { createServer } from 'node:http';
import { test, start, reply, allowBrowser } from './fixture';

function pageResult(value: any): any {
  if (typeof value === 'string') { try { return pageResult(JSON.parse(value)); } catch { return; } }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value.elements)) return value;
  for (const nested of Object.values(value)) { const found = pageResult(nested); if (found) return found; }
}

test('agent opens custom mail rows without clicking nested actions and receives precise errors', async ({ workspace }) => {
  test.setTimeout(120_000);
  const site = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><title>Custom mail fixture</title>
      <div style="position:absolute;top:4000px">${'<button>Offscreen action</button>'.repeat(270)}</div>
      <button disabled>Unavailable preview</button>
      <div style="position:relative;width:140px;height:35px"><button style="width:100%;height:100%">Covered preview</button><div style="position:absolute;inset:0;background:white">Cover</div></div>
      <ol><li role="option" value="7">Inbox folder</li></ol>
      <div role="row" style="position:relative;height:70px;border:1px solid"><span>Payment instructions</span><button style="position:absolute;left:40%;top:0;width:20%;height:100%">Delete email</button></div>
      <div id="delegated" style="cursor:pointer;height:40px;border:1px solid"><span>Second message</span></div>
      <article id="body"></article><p id="unsafe"></p>
      <script>
        document.querySelector('[role=row]').addEventListener('click', e => { if(e.isTrusted) document.querySelector('#body').textContent='Payment email body: fixture reference INV-123.'; });
        document.querySelector('[role=row] button').addEventListener('click', e => { e.stopPropagation(); document.querySelector('#unsafe').textContent='DELETE ACTION ACTIVATED'; });
        document.body.addEventListener('click', e => { if(e.isTrusted && e.target.closest('#delegated')) document.querySelector('#body').textContent += ' Second email body: receipt confirmed.'; });
      </script>`);
  });
  await new Promise<void>(resolve => site.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(site.address() as { port: number }).port}/`;
  let initial: any;
  const observed: string[] = [];
  const work = await workspace((body, res) => {
    const results = body.messages.filter((m: any) => m.role === 'tool');
    if (results.length) {
      observed[results.length - 1] = JSON.stringify(results.at(-1).content);
      if (results.length === 1) initial = pageResult(results[0].content);
    }
    const find = (label: string, page = initial) => page?.elements.find((e: any) => e.label.includes(label))?.ref ?? '999';
    const latest = results.length ? pageResult(results.at(-1).content) : undefined;
    const steps = [
      { action: 'open', url },
      { action: 'click', ref: find('Unavailable preview') },
      { action: 'click', ref: find('Covered preview') },
      { action: 'click', ref: '999' },
      { action: 'click', ref: find('Payment instructions') },
      { action: 'click', ref: find('Second message', latest) },
      { action: 'read' },
    ];
    if (results.length < steps.length) reply(body, res, '', [{ function: { name: 'browser', arguments: steps[results.length] } }]);
    else reply(body, res, latest?.text ?? 'No page body returned.');
    return true;
  });
  try {
    // Keep this scripted interaction fixture independent of model compaction.
    work.setContextWindow(1_048_576);
    await work.restart();
    await start(work.page, 'Read the two fixture emails');
    await allowBrowser(work.page);
    const answer = work.page.getByTestId('assistant-message').last();
    await expect(answer).toContainText('Second email body: receipt confirmed.', { timeout: 60_000 });
    await expect(answer).toContainText('Payment email body: fixture reference INV-123.');
    await expect(answer).not.toContainText('DELETE ACTION ACTIVATED');
    expect(initial.elements.some((e: any) => e.role === 'row' && e.label.includes('Payment instructions'))).toBe(true);
    expect(initial.elements.find((e: any) => e.label === 'Inbox folder').value).toBe('7');
    expect(observed[1]).toContain('This control is disabled');
    expect(observed[2]).toContain('no unobstructed click target');
    expect(observed[3]).toContain('Element is stale');
    expect(observed.join(' ')).not.toContain('Script failed to execute');
  } finally {
    work.setContextWindow(32768);
    await work.restart();
    await work.close(); site.closeAllConnections();
    await new Promise<void>(resolve => site.close(() => resolve()));
  }
});
