import { useState } from 'react';
import { Button, Modal } from './ui';
import type { BrowserDownload } from '../shared/types';

export function BrowserDownloads({ downloads, open, close }: { downloads: BrowserDownload[]; open: boolean; close: () => void }) {
  const [error, setError] = useState('');
  async function act(id: string, action: 'cancel' | 'reveal') {
    try { setError(''); await window.dextana.browserDownload(id, action); }
    catch { setError('Could not complete that download action.'); }
  }
  return <>
    {open && <Modal title="Downloads" closeLabel="Close downloads" description="Files downloaded in this chat. Choose where to save each file in the Save dialog." close={close}>
      {!downloads.length && <p>No downloads yet.</p>}
      <ul className="browser-downloads-list">{[...downloads].reverse().map(item => <li key={item.id}>
        <div><strong>{item.filename}</strong><p role="status">{item.state === 'completed' ? 'Saved' : item.state === 'cancelled' ? 'Cancelled' : item.state === 'interrupted' ? 'Failed' : 'Downloading · choose a location if prompted'}{item.totalBytes > 0 && item.state === 'progressing' ? ` · ${Math.floor(item.receivedBytes / item.totalBytes * 100)}%` : ''}</p>{item.message && <p>{item.message}</p>}</div>
        {item.state === 'completed' && <Button size="small" onClick={() => void act(item.id, 'reveal')}>Show in folder</Button>}
        {item.state === 'progressing' && <Button size="small" onClick={() => void act(item.id, 'cancel')}>Cancel</Button>}
      </li>)}</ul>{error && <p role="alert">{error}</p>}
    </Modal>}
  </>;
}
