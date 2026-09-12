import { expect } from '@playwright/test';
import { test, start, reply } from './fixture';

const uuid = /\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/i;
function alarm(value: any): any {
  if (typeof value === 'string') { try { return alarm(JSON.parse(value)); } catch { return; } }
  if (!value || typeof value !== 'object') return;
  if (value.title === 'Receipt audit timer' && value.id) return value;
  for (const item of Object.values(value)) { const found = alarm(item); if (found) return found; }
}

test('desktop references survive restart and chat context excludes internal metadata', async ({ workspace }) => {
  test.setTimeout(120_000);
  let reference = '';
  let receipt: any;
  let contextChecked = false;
  const work = await workspace((body, res) => {
    const userIndex = body.messages.findLastIndex((message: any) => message.role === 'user');
    const prompt = body.messages[userIndex].content;
    const pause = prompt.includes('Pause saved timer');
    const results = body.messages.slice(userIndex + 1).filter((message: any) => message.role === 'tool');
    if (pause) {
      const context = prompt.match(/<work_context>([\s\S]*?)<\/work_context>/)?.[1];
      expect(context).toContain('Receipt audit timer');
      expect(context).not.toMatch(uuid);
      expect(context).not.toContain('resourceId');
      contextChecked = true;
    }
    if (!results.length) reply(body, res, '', [{ function: { name: 'desktop', arguments: { action: 'discover', work: 'time' } } }]);
    else if (results.length === 1) reply(body, res, '', [{ function: { name: 'desktop', arguments: {
      action: 'call', operation: pause ? 'timer.pause' : 'timer.start',
      arguments_json: JSON.stringify(pause ? { id: reference } : { title: 'Receipt audit timer', durationSeconds: 3600 }),
    } } }]);
    else {
      receipt = alarm(results.at(-1).content);
      expect(receipt).toBeTruthy();
      expect(String(results.at(-1).content)).not.toMatch(uuid);
      expect(receipt).not.toHaveProperty('sourceActivityId');
      expect(receipt).not.toHaveProperty('requestId');
      expect(receipt.id).toMatch(/^Alarm \d+$/);
      if (pause) expect(receipt.id).toBe(reference);
      reference = receipt.id;
      reply(body, res, 'Timer result: ' + results.at(-1).content);
    }
    return true;
  });
  async function approve() {
    const approval = work.page.getByRole('region', { name: 'Action approval' });
    await expect(approval).toBeVisible({ timeout: 60_000 });
    await approval.getByRole('button', { name: 'Allow action', exact: true }).click();
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', { timeout: 60_000 });
    await expect(work.page.getByTestId('assistant-message').last()).not.toContainText(uuid);
  }
  try {
    await start(work.page, 'Create the receipt audit timer for one hour');
    await approve();
    expect(receipt.state).toBe('running');
    await work.restart();
    await work.page.getByRole('button', { name: 'Create the receipt audit timer for one hour', exact: true }).click();
    await work.page.getByLabel('Describe your work').fill('Pause saved timer');
    await work.page.getByRole('button', { name: 'Send message', exact: true }).click();
    await approve();
    expect(receipt.state).toBe('paused');
    expect(contextChecked).toBe(true);
  } finally { await work.close(); }
});
