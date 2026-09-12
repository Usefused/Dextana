import type { BrowserDownloadReceipt } from '../../shared/types';

const states = new Set<BrowserDownloadReceipt['state']>([
  'progressing',
  'completed',
  'cancelled',
  'interrupted',
]);

function checkedText(value: unknown, limit: number) {
  if (typeof value !== 'string' || !value || value.length > limit || /[\x00-\x1f\x7f]/.test(value))
    throw new Error('Invalid browser download metadata.');
  return value;
}

function checkedBytes(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) < 0)
    throw new Error('Invalid browser download size.');
  return Number(value);
}

function receipt(value: unknown): BrowserDownloadReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid browser download.');
  const input = value as Record<string, unknown>;
  if (!states.has(input.state as BrowserDownloadReceipt['state']))
    throw new Error('Invalid browser download state.');
  const state = input.state as BrowserDownloadReceipt['state'];
  const path = input.path === undefined ? undefined : checkedText(input.path, 32_768);
  if (path && state !== 'completed') throw new Error('Only completed downloads may expose a path.');
  return {
    filename: checkedText(input.filename, 240),
    state,
    receivedBytes: checkedBytes(input.receivedBytes),
    totalBytes: checkedBytes(input.totalBytes),
    ...(path ? { path } : {}),
    ...(input.message === undefined ? {} : { message: checkedText(input.message, 500) }),
  };
}

/** Keeps only the current connection's explicitly observed download receipts. */
export class UserBrowserDownloads {
  private items: { tabId: string; receipt: BrowserDownloadReceipt }[] = [];

  update(value: unknown) {
    if (value === undefined) return;
    if (!Array.isArray(value) || value.length > 100)
      throw new Error('Invalid browser download inventory.');
    this.items = value.map((item) => {
      const tabId = item && typeof item === 'object' ? (item as Record<string, unknown>).tabId : '';
      if (typeof tabId !== 'string' || !/^[a-f0-9-]{36}$/.test(tabId))
        throw new Error('Invalid browser download tab.');
      return { tabId, receipt: receipt(item) };
    });
  }

  list(tabIds: ReadonlySet<string>) {
    return {
      browser: 'user',
      downloads: this.items
        .filter((item) => tabIds.has(item.tabId))
        .map((item) => ({ ...item.receipt })),
      instruction:
        'Only a completed download with a saved path proves the file is available. Use the files tool with normal read permission to inspect it.',
    };
  }
}
