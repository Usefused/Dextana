import { app, shell, type DownloadItem } from 'electron';
import { randomUUID } from 'node:crypto';
import { basename, join } from 'node:path';
import type { BrowserDownload, BrowserDownloadReceipt } from '../shared/types';

// Agent results contain useful file facts, not desktop bookkeeping identifiers.
export function downloadReceipt(record: BrowserDownload): BrowserDownloadReceipt {
  const { filename, state, receivedBytes, totalBytes, path, message } = record;
  return { filename, state, receivedBytes, totalBytes, ...(path ? { path } : {}), ...(message ? { message } : {}) };
}

/** Chromium owns the transfer, cookies, POST body and native Save dialog. */
export class BrowserDownloads {
  private records = new Map<string, BrowserDownload>();
  private items = new Map<string, DownloadItem>();
  constructor(private changed: () => void) {}
  desktopRecords(activityId: string, tabId?: string): BrowserDownload[] {
    return [...this.records.values()].filter(item => item.activityId === activityId && (!tabId || item.tabId === tabId)).map(item => ({ ...item }));
  }
  receipts(activityId: string, tabId?: string): BrowserDownloadReceipt[] {
    return this.desktopRecords(activityId, tabId).map(downloadReceipt);
  }
  start(item: DownloadItem, activityId: string, tabId: string, approvedOrigins?: string[]) {
    const filename = basename(item.getFilename().replaceAll('\\', '/')).replace(/[\x00-\x1f\x7f]/g, '').slice(0, 200) || 'download';
    const record: BrowserDownload = {
      id: randomUUID(), activityId, tabId, filename, state: 'progressing',
      receivedBytes: 0, totalBytes: item.getTotalBytes(),
    };
    // An approved website does not imply approval for a redirected download source.
    const outsideScope = approvedOrigins && item.getURLChain().some(url => {
      try { const parsed = new URL(url); return !approvedOrigins.includes(parsed.origin); } catch { return true; }
    });
    const tooMany = this.desktopRecords(activityId).filter(entry => entry.state === 'progressing').length >= 3;
    if (outsideScope || tooMany) {
      record.state = 'cancelled';
      record.message = outsideScope ? 'Download redirected outside the approved plan. Request permission for its source.' : 'Finish or cancel an existing download first.';
      this.records.set(record.id, record);
      item.cancel();
      this.trim();
      this.changed();
      return;
    }
    this.records.set(record.id, record);
    this.items.set(record.id, item);
    // Never choose a destination for the owner or execute a downloaded file.
    item.setSaveDialogOptions({ title: 'Save browser download', defaultPath: join(app.getPath('downloads'), filename), buttonLabel: 'Save', properties: ['showOverwriteConfirmation'] });
    item.on('updated', (_event, state) => {
      record.receivedBytes = item.getReceivedBytes();
      record.totalBytes = item.getTotalBytes();
      record.message = state === 'interrupted' ? 'Download interrupted.' : undefined;
      this.changed();
    });
    item.once('done', (_event, state) => {
      record.state = state;
      record.receivedBytes = item.getReceivedBytes();
      if (state === 'completed') { record.path = item.getSavePath(); record.filename = basename(record.path); }
      record.message = state === 'interrupted' ? 'Download failed. Check your connection before trying again.' : undefined;
      this.items.delete(record.id);
      this.trim();
      this.changed();
    });
    this.trim();
    this.changed();
  }
  private trim() {
    for (const [id, record] of this.records) {
      if (this.records.size <= 100) break;
      if (record.state !== 'progressing') this.records.delete(id);
    }
  }
  cancel(id: string) { this.items.get(id)?.cancel(); }
  reveal(id: string) {
    const record = this.records.get(id);
    if (!record?.path || record.state !== 'completed') throw new Error('This download has not been saved.');
    shell.showItemInFolder(record.path);
  }
  cancelTab(tabId: string) {
    for (const record of this.records.values()) if (record.tabId === tabId) this.cancel(record.id);
  }
  close() { for (const item of this.items.values()) item.cancel(); }
}
