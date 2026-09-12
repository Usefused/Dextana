import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { mkdtemp, writeFile, readFile, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorkFiles } from '../../src/main/files';
import { LocalCapabilities, ActionDenied } from '../../src/main/local-capabilities';
import { Store } from '../../src/main/store';
import { ActionApproval } from '../../src/renderer/ActionApproval';
import type { Activity } from '../../src/shared/types';

test.each(['approve', 'deny', 'cancel', 'changed'] as const)('file edit review with session-wide access: %s', async decision => {
  const directory = await mkdtemp(join(tmpdir(), 'dextana-edit-gate-'));
  const controller = new AbortController();
  try {
    const path = join(directory, 'Note.txt');
    await writeFile(path, 'Original <script>literal</script>');
    const store = new Store(directory);
    vi.spyOn(store, 'save').mockResolvedValue();
    const activity: Activity = { id: 'chat', title: 'Edit my note', model: 'test', ollamaUrl: '', status: 'running', messages: [], events: [], allowAllApprovals: true };
    store.state.activities.push(activity);
    const local = new LocalCapabilities(store, () => {}, {} as any, {} as any, undefined, new WorkFiles(directory));
    const read = await local.execute(activity, { name: 'files', arguments: { action: 'read', path } }, controller.signal) as { revision: string };
    expect(read.revision).toMatch(/^[a-f0-9]{64}$/);
    const outcome = local.execute(activity, { name: 'files', arguments: { action: 'edit', path, expected_revision: read.revision, content: 'Approved replacement' } }, controller.signal).then(value => ({ value }), error => ({ error }));
    await vi.waitFor(() => expect(activity.approval?.capability).toBe('fileEdit'));
    expect(await readFile(path, 'utf8')).toBe('Original <script>literal</script>');
    const html = renderToStaticMarkup(React.createElement(ActionApproval, { activityId: activity.id, approval: activity.approval! }));
    expect(html).toContain('Current content');
    expect(html).toContain('Proposed content');
    expect(html).toContain('Approved replacement');
    expect(html).toContain('Apply changes');
    expect(html).toContain('Keep original');
    expect(html).not.toContain('Allow all');
    expect(html).not.toContain('<script>literal</script>');
    const input = { activityId: activity.id, approvalId: activity.approval!.id, approved: true };
    await expect(local.approve({ ...input, autoAllow: true })).rejects.toThrow('Each file edit');
    if (decision === 'changed') await writeFile(path, 'Newer external version');
    if (decision === 'cancel') controller.abort();
    else await local.approve({ ...input, approved: decision !== 'deny' });
    const result = await outcome;
    if (decision === 'approve') {
      expect(result).toMatchObject({ value: { edited: true, path: await realpath(path) } });
      expect(await readFile(path, 'utf8')).toBe('Approved replacement');
      expect(activity.context?.[0].status).toBe('edited');
      await expect(local.approve(input)).rejects.toThrow('no longer pending');
    } else {
      expect(await readFile(path, 'utf8')).toBe(decision === 'changed' ? 'Newer external version' : 'Original <script>literal</script>');
      if (decision === 'deny') expect(result).toMatchObject({ error: expect.any(ActionDenied) });
      if (decision === 'changed') expect(result).toMatchObject({ value: { error: expect.stringContaining('file changed') } });
      expect(activity.context?.[0].status).toBe('read');
    }
    expect(activity.approval).toBeUndefined();
  } finally { controller.abort(); await rm(directory, { recursive: true, force: true }); }
});
