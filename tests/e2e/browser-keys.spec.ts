import { expect } from '@playwright/test';
import { createServer } from 'node:http';
import { test, start, reply, allowBrowser } from './fixture';

test('agent submits from focus and dismisses dialogs, popovers and backdrops with trusted input', async ({ workspace }) => {
  test.setTimeout(120_000);
  const site = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<button id="open-dialog">Open dialog</button><button id="open-overlay">Open overlay</button><button popovertarget="popup">Open popover</button>
      <dialog aria-label="Edit report"><form method="dialog"><input aria-label="Report name"><button>Save</button></form></dialog>
      <div id="backdrop" hidden style="position:fixed;inset:0;background:#0008"><section role="dialog" aria-label="Overlay" style="position:absolute;left:25%;top:25%;width:50%;height:50%;background:white">Overlay content</section></div>
      <div id="popup" popover aria-label="Quick menu">Popover content</div><p id="result"></p>
      <script>
      const dialog = document.querySelector('dialog'), backdrop = document.querySelector('#backdrop'), result = document.querySelector('#result');
      const record = text => result.textContent += text + '; ';
      document.querySelector('#open-dialog').onclick = () => dialog.showModal();
      document.querySelector('#open-overlay').onclick = () => { backdrop.hidden = false; };
      dialog.oncancel = e => { if (e.isTrusted) record('Escape dismissed dialog'); };
      document.querySelector('form').onsubmit = e => { if (e.isTrusted) record('Submitted: ' + document.querySelector('input').value); };
      document.addEventListener('keydown', e => { if (e.isTrusted && e.key === 'Tab') record(e.shiftKey ? 'Reverse tab' : 'Forward tab'); });
      backdrop.addEventListener('pointerdown', e => { if (e.target === backdrop && e.isTrusted) { backdrop.hidden = true; record('Outside pointer dismissed overlay'); } });
      document.querySelector('#popup').addEventListener('toggle', e => { if (e.newState === 'closed') record('Popover dismissed'); });
      </script>`);
  });
  await new Promise<void>(resolve => site.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(site.address() as { port: number }).port}/`;
  const observed: string[] = [];
  const steps = [
    { action: 'open', url }, { action: 'click', ref: '1' }, { action: 'fill', ref: '4', text: 'Weekly report' },
    { action: 'press', key: 'Tab' }, { action: 'press', key: 'Shift+Tab' }, { action: 'press', key: 'Return' },
    { action: 'click', ref: '1' }, { action: 'press', key: 'Esc' },
    { action: 'click', ref: '2' }, { action: 'click_outside', ref: '1' }, { action: 'click_outside', ref: '4' },
    { action: 'click', ref: '3' }, { action: 'press', key: 'Escape' }, { action: 'read' },
  ];
  const work = await workspace((body, res) => {
    const results = body.messages.filter((m: any) => m.role === 'tool');
    if (results.length) observed[results.length - 1] = JSON.stringify(results.at(-1).content);
    if (results.length < steps.length) reply(body, res, '', [{ function: { name: 'browser', arguments: steps[results.length] } }]);
    else reply(body, res, JSON.stringify(results.at(-1).content));
    return true;
  });
  try {
    await start(work.page, 'Submit the report and dismiss the dialogs and overlays');
    await allowBrowser(work.page);
    const answer = work.page.getByTestId('assistant-message').last();
    await expect(answer).toContainText('Popover dismissed', { timeout: 90_000 });
    for (const text of ['Submitted: Weekly report', 'Forward tab', 'Reverse tab', 'Escape dismissed dialog', 'Outside pointer dismissed overlay']) await expect(answer).toContainText(text);
    expect(observed[1]).toContain('overlays');
    expect(observed[3]).toMatch(/focused_ref.*5/);
    expect(observed[4]).toMatch(/focused_ref.*4/);
    expect(observed[9]).toContain('Choose an overlay reference');
  } finally {
    await work.close(); site.closeAllConnections();
    await new Promise<void>(resolve => site.close(() => resolve()));
  }
});

test('overlay recovery refuses covered controls and outside clicks on underlying actions', async ({ workspace }) => {
  test.setTimeout(120_000);
  const site = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<button style="position:fixed;inset:0" onclick="this.textContent='Background activated'">Background untouched</button><section role="dialog" aria-label="Blocking overlay" style="position:fixed;left:25%;top:25%;width:50%;height:50%;background:white">This overlay stays open</section>`);
  });
  await new Promise<void>(resolve => site.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(site.address() as { port: number }).port}/`;
  const observed: string[] = [];
  const steps = [{ action: 'open', url }, { action: 'click_outside', ref: '2' }, { action: 'press', ref: '1', key: 'Enter' }, { action: 'press', key: 'Escape' }, { action: 'read' }];
  const work = await workspace((body, res) => {
    const results = body.messages.filter((m: any) => m.role === 'tool');
    if (results.length) observed[results.length - 1] = JSON.stringify(results.at(-1).content);
    if (results.length < steps.length) reply(body, res, '', [{ function: { name: 'browser', arguments: steps[results.length] } }]);
    else reply(body, res, JSON.stringify(results.at(-1).content));
    return true;
  });
  try {
    await start(work.page, 'Dismiss the blocking overlay without activating background actions');
    await allowBrowser(work.page);
    await expect(work.page.getByTestId('assistant-message').last()).toContainText('Background untouched', { timeout: 60_000 });
    expect(observed[1]).toContain('No unobstructed non-interactive area');
    expect(observed[2]).toContain('This control is obscured');
    expect(observed[3]).toContain('Blocking overlay');
    expect(observed.at(-1)).not.toContain('Background activated');
  } finally {
    await work.close(); site.closeAllConnections();
    await new Promise<void>(resolve => site.close(() => resolve()));
  }
});

test('agent copies, pastes, edits and submits a custom search with keyboard actions', async ({ workspace }) => {
  test.setTimeout(120_000);
  const site = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<form><input aria-label="Source"></form><p id="form-result"></p><div contenteditable="true" role="searchbox" aria-label="Search" style="border:1px solid;min-height:25px"></div><p id="result"></p><script>
      document.querySelector('form').onsubmit = e => { e.preventDefault(); document.querySelector('#form-result').textContent = 'Native form submitted'; };
      document.querySelector('[contenteditable]').addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.isTrusted) { e.preventDefault(); document.querySelector('#result').textContent = 'Search submitted: ' + e.target.textContent; }
      });
    </script>`);
  });
  await new Promise<void>(resolve => site.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(site.address() as { port: number }).port}/`;
  const work = await workspace((body, res) => {
    const results = body.messages.filter((m: any) => m.role === 'tool');
    const steps = [
      { action: 'open', url }, { action: 'fill', ref: '1', text: 'Zoho!' },
      { action: 'press', ref: '1', key: 'SelectAll' }, { action: 'press', ref: '1', key: 'Copy' },
      { action: 'press', ref: '2', key: 'Paste' }, { action: 'press', ref: '2', key: 'Backspace' },
      { action: 'press', key: 'Space' }, { action: 'press', key: 'Backspace' },
      { action: 'press', ref: '2', key: 'Enter' }, { action: 'press', ref: '1', key: 'Enter' }, { action: 'read' },
    ];
    if (results.length < steps.length) reply(body, res, '', [{ function: { name: 'browser', arguments: steps[results.length] } }]);
    else reply(body, res, JSON.stringify(results.at(-1).content));
    return true;
  });
  try {
    await start(work.page, 'Test keyboard search submission');
    await allowBrowser(work.page);
    await expect(work.page.getByTestId('assistant-message').last()).toContainText('Search submitted: Zoho', { timeout: 60_000 });
    await expect(work.page.getByTestId('assistant-message').last()).toContainText('Native form submitted');
    await expect(work.page.getByTestId('assistant-message').last()).not.toContainText('Search submitted: Zoho!');
  } finally {
    await work.close(); site.closeAllConnections();
    await new Promise<void>(resolve => site.close(() => resolve()));
  }
});
