import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { expect, test, vi } from 'vitest';
vi.mock('electron', () => ({ app: { getPath: () => '/downloads' }, shell: { showItemInFolder: vi.fn() } }));
import { BrowserDownloads, downloadReceipt } from '../../src/main/browser-downloads';
import { shell, type DownloadItem } from 'electron';

function transfer(urls = ['https://example.com/receipt']) {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    getFilename: () => '../receipt.pdf', getTotalBytes: () => 128,
    getReceivedBytes: () => 128, getURLChain: () => urls,
    getSavePath: () => '/chosen/receipt.pdf', setSaveDialogOptions: vi.fn(),
    cancel: vi.fn(() => emitter.emit('done', {}, 'cancelled')),
  });
}

test('downloads remain activity-owned, need a save choice, and reveal only completed files', () => {
  const downloads = new BrowserDownloads(vi.fn());
  const item = transfer();
  downloads.start(item as unknown as DownloadItem, 'owner', 'tab');
  expect(item.setSaveDialogOptions).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: join('/downloads', 'receipt.pdf') }));
  expect(downloads.desktopRecords('other')).toEqual([]);
  const record = downloads.desktopRecords('owner')[0];
  expect(record.path).toBeUndefined();
  expect(() => downloads.reveal(record.id)).toThrow('not been saved');
  item.emit('done', {}, 'completed');
  expect(downloads.desktopRecords('owner')[0]).toMatchObject({ state: 'completed', path: '/chosen/receipt.pdf' });
  downloads.reveal(record.id);
  expect(shell.showItemInFolder).toHaveBeenCalledWith('/chosen/receipt.pdf');
});

test('out-of-plan redirects are cancelled before any save dialog', () => {
  const downloads = new BrowserDownloads(vi.fn()), item = transfer(['https://example.com/receipt', 'https://other.example/receipt']);
  downloads.start(item as unknown as DownloadItem, 'owner', 'tab', ['https://example.com']);
  expect(item.cancel).toHaveBeenCalled();
  expect(item.setSaveDialogOptions).not.toHaveBeenCalled();
  expect(downloads.desktopRecords('owner')[0]).toMatchObject({ state: 'cancelled', message: expect.stringContaining('outside the approved plan') });
});

test('closing a tab cancels only its own downloads and never produces saved paths', () => {
  const downloads = new BrowserDownloads(vi.fn()), first = transfer(), second = transfer();
  downloads.start(first as unknown as DownloadItem, 'owner', 'one');
  downloads.start(second as unknown as DownloadItem, 'owner', 'two');
  downloads.cancelTab('one');
  expect(first.cancel).toHaveBeenCalled();
  expect(second.cancel).not.toHaveBeenCalled();
  expect(downloads.desktopRecords('owner', 'one')[0]).toMatchObject({ state: 'cancelled' });
  expect(downloads.desktopRecords('owner', 'one')[0].path).toBeUndefined();
  second.emit('done', {}, 'interrupted');
  expect(downloads.desktopRecords('owner', 'two')[0]).toMatchObject({ state: 'interrupted' });
  expect(downloads.desktopRecords('owner', 'two')[0].path).toBeUndefined();
});


test('agent receipts exclude internal IDs while retaining file completion evidence', () => {
  const downloads = new BrowserDownloads(vi.fn()), item = transfer();
  downloads.start(item as unknown as DownloadItem, 'internal-activity', 'internal-tab');
  item.emit('done', {}, 'completed');
  expect(downloads.receipts('internal-activity')).toEqual([{
    filename: 'receipt.pdf', state: 'completed', receivedBytes: 128, totalBytes: 128,
    path: '/chosen/receipt.pdf',
  }]);
  expect(downloads.desktopRecords('internal-activity')[0]).toHaveProperty('id');
  expect(downloads.receipts('other-activity')).toEqual([]);
});


test('receipt projection drops unknown future metadata and returns detached values', () => {
  const record = {
    id: 'private-download', activityId: 'private-activity', tabId: 'private-tab',
    filename: 'receipt.pdf', state: 'completed' as const, receivedBytes: 128, totalBytes: 128,
    path: '/chosen/receipt.pdf', message: 'Saved',
    futureMetadata: { auth: 'must-not-cross-the-boundary' },
  };
  const receipt = downloadReceipt(record);
  expect(receipt).toEqual({ filename: 'receipt.pdf', state: 'completed', receivedBytes: 128,
    totalBytes: 128, path: '/chosen/receipt.pdf', message: 'Saved' });
  receipt.filename = 'changed.pdf';
  expect(record.filename).toBe('receipt.pdf');
});
