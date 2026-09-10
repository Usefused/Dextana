import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
  access,
  symlink,
  realpath,
  link,
  unlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DesktopWorkflows, type DesktopWorkflowHost } from '../../src/main/desktop/workflows';
import { desktopWorkflowDescriptors } from '../../src/shared/desktop-workflows';
import * as localProcessors from '../../src/main/desktop/workflows-processors';
import { desktopOutput, validateProcessing } from '../../src/main/desktop/workflows-processors';

describe('desktop workflows layer', () => {
  let directory: string;
  let service: DesktopWorkflows;
  let host: DesktopWorkflowHost;
  const context = { activityId: 'owner' };
  const execute = (
    action: string,
    args: Record<string, unknown> = {},
    signal = new AbortController().signal,
  ) => service.execute(action, args, signal, context) as Promise<any>;
  beforeEach(async () => {
    directory = await realpath(await mkdtemp(join(tmpdir(), 'dextana-workflows-')));
    host = {
      openPath: vi.fn(async () => {}),
      openURL: vi.fn(async () => {}),
      notify: vi.fn(async () => {}),
      runWatch: vi.fn(async () => {}),
    };
    service = new DesktopWorkflows(join(directory, 'state'), host);
    await service.initialize();
  });
  afterEach(async () => {
    await service.dispose();
    await rm(directory, { recursive: true, force: true });
  });

  it('durably previews, reviews, applies and undoes renames without overwriting files', async () => {
    const from = join(directory, 'receipt.txt');
    const to = join(directory, '2026-09-supplier.txt');
    await writeFile(from, 'receipt');
    const preview = await execute('workflow.rename_preview', {
      entries: [{ from, name: '2026-09-supplier.txt' }],
    });
    expect(await readFile(from, 'utf8')).toBe('receipt');
    await expect(access(to)).rejects.toThrow();
    const details = await service.prepare('workflow.rename_apply', { id: preview.id }, context);
    expect(JSON.parse(details.preview!)).toMatchObject({
      entries: [{ from, to, completed: false }],
      status: 'preview',
    });
    await service.dispose();
    service = new DesktopWorkflows(join(directory, 'state'), host);
    await service.initialize();
    expect((await execute('workflow.rename_apply', { id: preview.id })).status).toBe('applied');
    await expect(access(from)).rejects.toThrow();
    expect(await readFile(to, 'utf8')).toBe('receipt');
    expect((await execute('workflow.rename_undo', { id: preview.id })).status).toBe('undone');
    expect(await readFile(from, 'utf8')).toBe('receipt');
    await expect(access(to)).rejects.toThrow();
  });

  it('rejects changed files, competing destinations, symbolic links and cross-chat preview ids', async () => {
    const from = join(directory, 'source.txt');
    await writeFile(from, 'initial');
    const preview = await execute('workflow.rename_preview', {
      entries: [{ from, name: 'new.txt' }],
    });
    await expect(
      service.execute('workflow.rename_apply', { id: preview.id }, new AbortController().signal, {
        activityId: 'other',
      }),
    ).rejects.toThrow('current chat');
    await writeFile(from, 'changed since approval');
    await expect(execute('workflow.rename_apply', { id: preview.id })).rejects.toThrow(
      'changed since preview',
    );
    const fresh = await execute('workflow.rename_preview', {
      entries: [{ from, name: 'new.txt' }],
    });
    await writeFile(join(directory, 'new.txt'), 'do not overwrite');
    await expect(execute('workflow.rename_apply', { id: fresh.id })).rejects.toThrow(
      'already exists',
    );
    expect(await readFile(join(directory, 'new.txt'), 'utf8')).toBe('do not overwrite');
    await symlink(from, join(directory, 'alias.txt'));
    await expect(
      execute('workflow.rename_preview', {
        entries: [{ from: join(directory, 'alias.txt'), name: 'renamed.txt' }],
      }),
    ).rejects.toThrow('symbolic link');
  });

  it('stops a cancelled rename before mutation and refuses to undo an edited document', async () => {
    const from = join(directory, 'source.txt');
    const to = join(directory, 'renamed.txt');
    await writeFile(from, 'before');
    const preview = await execute('workflow.rename_preview', {
      entries: [{ from, name: 'renamed.txt' }],
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      execute('workflow.rename_apply', { id: preview.id }, controller.signal),
    ).rejects.toThrow();
    expect(await readFile(from, 'utf8')).toBe('before');
    await execute('workflow.rename_apply', { id: preview.id });
    await writeFile(to, 'edited after rename');
    await expect(execute('workflow.rename_undo', { id: preview.id })).rejects.toThrow(
      'changed since preview',
    );
    expect(await readFile(to, 'utf8')).toBe('edited after rename');
  });

  it('opens setup targets with individual failures and restricts URL schemes', async () => {
    const path = join(directory, 'brief.txt');
    await writeFile(path, 'brief');
    host.openPath = vi.fn(async (input) => {
      if (input === path) throw new Error('No application installed');
    });
    const result = await execute('workflow.setup_open', {
      targets: [{ path }, { path: directory }, { url: 'https://example.com/dashboard' }],
    });
    expect(result.results.map((item: any) => item.opened)).toEqual([false, true, true]);
    expect(result.results[0].error).toContain('No application');
    expect(host.openURL).toHaveBeenCalledWith('https://example.com/dashboard');
    const rejected = await execute('workflow.setup_open', {
      targets: [
        { url: 'file:///etc/passwd' },
        { path: join(directory, 'missing.txt') },
        { path: directory },
      ],
    });
    expect(rejected.results.map((item: any) => item.opened)).toEqual([false, false, true]);
    expect(rejected.results[0].error).toContain('HTTP');
    expect(rejected.results[1]).toMatchObject({ target: 2, opened: false });
    expect(host.openURL).toHaveBeenCalledTimes(1);
    await execute('workflow.notify', { title: 'Finished', body: 'Your brief is ready', path });
    expect(host.notify).toHaveBeenCalledWith({
      title: 'Finished',
      body: 'Your brief is ready',
      path,
      activityId: 'owner',
    });
  });

  it('watches stable changes only, coalesces its own outputs, and reconciles offline changes', async () => {
    const folder = join(directory, 'inbox');
    await mkdir(folder);
    await writeFile(join(folder, 'old.txt'), 'baseline');
    const rule = await execute('workflow.watch_save', {
      name: 'Invoices',
      folder,
      prompt: 'Extract new invoices',
      extensions: ['txt'],
    });
    await service.tick();
    await service.tick();
    expect(host.runWatch).not.toHaveBeenCalled();
    await writeFile(join(folder, 'ignored.csv'), 'ignore');
    await writeFile(join(folder, 'new.txt'), 'new');
    host.runWatch = vi.fn(async () => {
      await writeFile(join(folder, 'tracker.txt'), 'workflow output');
    });
    await service.tick();
    expect(host.runWatch).not.toHaveBeenCalled();
    await service.tick();
    await vi.waitFor(() => expect(host.runWatch).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(service.snapshot().watches[0].status).toBe('watching'));
    await service.tick();
    await service.tick();
    expect(host.runWatch).toHaveBeenCalledTimes(1);
    expect(host.runWatch).toHaveBeenCalledWith(
      {
        ruleId: rule.id,
        activityId: 'owner',
        prompt: 'Extract new invoices',
        paths: [join(folder, 'new.txt')],
      },
      expect.any(AbortSignal),
    );
    await service.dispose();
    await writeFile(join(folder, 'offline.txt'), 'arrived offline');
    service = new DesktopWorkflows(join(directory, 'state'), host);
    await service.initialize();
    await vi.waitFor(async () => {
      await service.tick();
      expect(host.runWatch).toHaveBeenCalledTimes(2);
    });
  });

  it('preserves failed watch work for explicit retry without a repeating failure loop', async () => {
    const folder = join(directory, 'inbox');
    await mkdir(folder);
    host.runWatch = vi.fn(async () => {
      throw new Error('Model is offline');
    });
    const rule = await execute('workflow.watch_save', {
      name: 'Inbox',
      folder,
      prompt: 'Read documents',
    });
    await service.tick();
    await writeFile(join(folder, 'doc.txt'), 'text');
    await service.tick();
    await service.tick();
    await vi.waitFor(() => expect(service.snapshot().watches[0].status).toBe('error'));
    await service.tick();
    await service.tick();
    expect(host.runWatch).toHaveBeenCalledTimes(1);
    expect(service.snapshot().watches[0].pending).toHaveLength(1);
    host.runWatch = vi.fn(async () => {});
    await execute('workflow.watch_run', { id: rule.id });
    await vi.waitFor(() => expect(service.snapshot().watches[0].pending).toHaveLength(0));
  });

  it('pause and resume preserve pending watched files and removed rules cannot dispatch', async () => {
    const folder = join(directory, 'pending');
    await mkdir(folder);
    const rule = await execute('workflow.watch_save', {
      name: 'Paused inbox',
      folder,
      prompt: 'Read arrivals',
    });
    service.setOnBattery(true);
    await service.tick();
    await writeFile(join(folder, 'arrival.txt'), 'pending');
    await service.tick();
    await service.tick();
    expect(service.snapshot().watches[0].pending).toHaveLength(1);
    await execute('workflow.watch_set_enabled', { id: rule.id, enabled: false });
    service.setOnBattery(false);
    await service.tick();
    expect(host.runWatch).not.toHaveBeenCalled();
    expect(service.snapshot().watches[0].pending).toHaveLength(1);
    await execute('workflow.watch_remove', { id: rule.id });
    await service.tick();
    expect(service.snapshot().watches).toHaveLength(0);
    expect(host.runWatch).not.toHaveBeenCalled();
  });

  it('persists paused processing and runs local indexing on external power', async () => {
    const input = join(directory, 'brief.txt');
    const output = join(directory, 'index.json');
    await writeFile(input, 'Supplier invoice 42');
    service.setOnBattery(true);
    const job = await execute('processing.start', {
      kind: 'index',
      paths: [input],
      outputPath: output,
    });
    expect(job.status).toBe('paused');
    await expect(access(output)).rejects.toThrow();
    await service.dispose();
    service = new DesktopWorkflows(join(directory, 'state'), host);
    service.setOnBattery(true);
    await service.initialize();
    expect(service.snapshot().jobs[0].status).toBe('paused');
    service.setOnBattery(false);
    await vi.waitFor(() => expect(service.snapshot().jobs[0].status).toBe('completed'));
    expect(await readFile(output, 'utf8')).toContain('Supplier invoice 42');
    expect(host.notify).toHaveBeenCalledWith(
      expect.objectContaining({ path: output, activityId: 'owner' }),
    );
    await expect(
      execute('processing.start', { kind: 'index', paths: [input], outputPath: output }),
    ).rejects.toThrow('already exists');
  });

  it('notifies on a background processor failure while retaining its failed job', async () => {
    const input = join(directory, 'brief.txt');
    const output = join(directory, 'index.json');
    await writeFile(input, 'Brief');
    const processor = vi
      .spyOn(localProcessors, 'processLocally')
      .mockRejectedValueOnce(new Error('Processor unavailable'));
    try {
      await execute('processing.start', { kind: 'index', paths: [input], outputPath: output });
      await vi.waitFor(() =>
        expect(host.notify).toHaveBeenCalledExactlyOnceWith({
          title: 'Local processing failed',
          body: 'index.json',
          activityId: 'owner',
          severity: 'error',
        }),
      );
      expect(service.snapshot().jobs[0].status).toBe('failed');
      expect(service.snapshot().jobs[0].error).toBe('Processor unavailable');
    } finally {
      processor.mockRestore();
    }
  });

  it('keeps a durably saved watch in memory and after restart when its observer throws', async () => {
    const folder = join(directory, 'observer-failure');
    await mkdir(folder);
    host.onChange = vi.fn(() => {
      throw new Error('The renderer is unavailable');
    });
    const saved = await execute('workflow.watch_save', {
      name: 'Durable inbox',
      folder,
      prompt: 'Read arriving invoices',
      enabled: false,
    });
    expect(host.onChange).toHaveBeenCalled();
    expect(service.snapshot().watches).toMatchObject([{ id: saved.id, name: 'Durable inbox' }]);
    const persisted = JSON.parse(
      await readFile(join(directory, 'state', 'desktop-workflows.json'), 'utf8'),
    );
    expect(persisted.watches).toMatchObject([{ id: saved.id }]);
    expect(() => service.setOnBattery(true)).not.toThrow();
    await service.dispose();
    service = new DesktopWorkflows(join(directory, 'state'), host);
    await service.initialize();
    expect(service.snapshot().watches).toMatchObject([{ id: saved.id, enabled: false }]);
  });

  it('drains a started mutation on shutdown and rejects queued or newly submitted work', async () => {
    const folder = join(directory, 'shutdown');
    await mkdir(folder);
    const originalSave = (service as any).save.bind(service);
    let releaseSave: () => void = () => {};
    let savingStarted: () => void = () => {};
    const blocked = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    const started = new Promise<void>((resolve) => {
      savingStarted = resolve;
    });
    const save = vi.spyOn(service as any, 'save').mockImplementationOnce(async () => {
      savingStarted();
      await blocked;
      await originalSave();
    });
    const args = {
      name: 'Started before shutdown',
      folder,
      prompt: 'Read invoices',
      enabled: false,
    };
    const creating = execute('workflow.watch_save', args);
    await started;
    const queued = execute('workflow.watch_save', {
      ...args,
      name: 'Queued after the first watch',
    }).then(
      () => 'unexpected success',
      (error) => error.message,
    );
    await Promise.resolve();
    let disposed = false;
    const disposing = service.dispose().then(() => {
      disposed = true;
    });
    try {
      await Promise.resolve();
      expect(disposed).toBe(false);
      await expect(execute('workflow.watch_list')).rejects.toThrow('shutting down');
      releaseSave();
      const rule = await creating;
      expect(await queued).toContain('shutting down');
      await disposing;
      const persisted = JSON.parse(
        await readFile(join(directory, 'state', 'desktop-workflows.json'), 'utf8'),
      );
      expect(persisted.watches).toHaveLength(1);
      expect(persisted.watches[0].id).toBe(rule.id);
    } finally {
      releaseSave();
      await Promise.allSettled([creating, queued, disposing]);
      save.mockRestore();
    }
  });

  it('does not retain or run a watch whose durable save failed', async () => {
    const folder = join(directory, 'save-failure');
    await mkdir(folder);
    const save = vi.spyOn(service as any, 'save').mockRejectedValueOnce(new Error('Disk full'));
    await expect(
      execute('workflow.watch_save', { name: 'Unsaved watch', folder, prompt: 'Read invoices' }),
    ).rejects.toThrow('Disk full');
    expect(service.snapshot().watches).toHaveLength(0);
    save.mockRestore();
    await writeFile(join(folder, 'new.txt'), 'new');
    await service.tick();
    await service.tick();
    expect(host.runWatch).not.toHaveBeenCalled();
  });

  it('keeps explicit cancellation final when battery and shutdown events arrive before the processor exits', async () => {
    const input = join(directory, 'cancel-race.txt');
    const output = join(directory, 'cancel-race.json');
    await writeFile(input, 'Cancel this work');
    let stopProcessor: (error: Error) => void = () => {};
    const processor = vi.spyOn(localProcessors, 'processLocally').mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          stopProcessor = reject;
        }),
    );
    try {
      const job = await execute('processing.start', {
        kind: 'index',
        paths: [input],
        outputPath: output,
      });
      await vi.waitFor(() => expect(processor).toHaveBeenCalledTimes(1));
      await execute('processing.cancel', { id: job.id });
      service.setOnBattery(true);
      const stopped = service.dispose();
      stopProcessor(new Error('Processor exited after cancellation'));
      await stopped;
      expect(service.snapshot().jobs[0].status).toBe('cancelled');
      await expect(access(output)).rejects.toThrow();
    } finally {
      stopProcessor(new Error('Test cleanup'));
      processor.mockRestore();
    }
  });

  it('does not infer a completed rename when a source becomes a symbolic link during crash recovery', async () => {
    const from = join(directory, 'recover.txt');
    const to = join(directory, 'renamed.txt');
    const unrelated = join(directory, 'unrelated.txt');
    await writeFile(from, 'Original');
    await writeFile(unrelated, 'Unrelated');
    const preview = await execute('workflow.rename_preview', {
      entries: [{ from, name: 'renamed.txt' }],
    });
    await service.dispose();
    await link(from, to);
    await unlink(from);
    await symlink(unrelated, from);
    const statePath = join(directory, 'state', 'desktop-workflows.json');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    const batch = state.renames.find((item: any) => item.id === preview.id);
    batch.status = 'applying';
    batch.direction = 'apply';
    await writeFile(statePath, JSON.stringify(state));
    service = new DesktopWorkflows(join(directory, 'state'), host);
    await service.initialize();
    expect(service.snapshot().renames[0].entries[0].moved).toBe(false);
    expect(await readFile(from, 'utf8')).toBe('Unrelated');
    expect(await readFile(to, 'utf8')).toBe('Original');
  });

  it('converts a text document through installed LibreOffice when available', async (context) => {
    if (!(await service.capabilities()).processors.convert) {
      context.skip();
      return;
    }
    const input = join(directory, 'conversion.txt');
    const output = join(directory, 'conversion.pdf');
    await writeFile(input, 'Dextana local conversion verification.');
    await execute('processing.start', { kind: 'convert', paths: [input], outputPath: output });
    await vi.waitFor(
      () => expect(['completed', 'failed']).toContain(service.snapshot().jobs[0].status),
      { timeout: 30000 },
    );
    expect(service.snapshot().jobs[0].error).toBeUndefined();
    expect((await readFile(output)).subarray(0, 5).toString()).toBe('%PDF-');
  }, 35000);

  it('cancels a queued job without writing output and reports optional processors honestly', async () => {
    const input = join(directory, 'brief.txt');
    const output = join(directory, 'index.json');
    await writeFile(input, 'brief');
    service.setOnBattery(true);
    const job = await execute('processing.start', {
      kind: 'index',
      paths: [input],
      outputPath: output,
    });
    expect((await execute('processing.cancel', { id: job.id })).status).toBe('cancelled');
    service.setOnBattery(false);
    await service.tick();
    await expect(access(output)).rejects.toThrow();
    await expect(
      validateProcessing({ kind: 'ocr', paths: [input], outputPath: output }, { index: true }),
    ).rejects.toThrow('Tesseract');
    const capabilities = await service.capabilities();
    expect(capabilities.processors.index).toBe(true);
    expect(capabilities).not.toHaveProperty('operations');
    expect(await execute('device.status')).not.toHaveProperty('operations');
    expect(await execute('processing.capabilities')).not.toHaveProperty('operations');
    expect(desktopWorkflowDescriptors.every((item) => item.name.includes('.'))).toBe(true);
    await expect(desktopOutput(input)).rejects.toThrow('already exists');
  });
});
