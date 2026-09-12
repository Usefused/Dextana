import type { WebContents } from 'electron';
import type { LoginMaterial } from './session-transfer';

export async function importLogin(contents: WebContents, url: string, material: LoginMaterial) {
  const debuggerAPI = contents.debugger;
  if (debuggerAPI.isAttached())
    throw new Error('Close browser developer tools before transferring.');
  debuggerAPI.attach('1.3');
  const pause = (_event: unknown, method: string, params: any) => {
    if (method === 'Fetch.requestPaused') {
      void debuggerAPI
        .sendCommand('Fetch.fulfillRequest', {
          requestId: params.requestId,
          responseCode: 200,
          responseHeaders: [
            { name: 'Content-Type', value: 'text/html' },
            { name: 'Cache-Control', value: 'no-store' },
          ],
          body: Buffer.from('<!doctype html><title>Connecting website login</title>').toString(
            'base64',
          ),
        })
        .catch(() => {});
    }
  };
  debuggerAPI.on('message', pause);
  try {
    await debuggerAPI.sendCommand('Network.setBypassServiceWorker', { bypass: true });
    await debuggerAPI.sendCommand('Fetch.enable', {
      patterns: [{ urlPattern: '*', resourceType: 'Document', requestStage: 'Request' }],
    });
    // An intercepted blank document establishes the exact origin and tab before
    // state is written. No application script runs during the installation.
    await loadPage(contents, url);
    const storage = JSON.stringify({
      origin: material.origin,
      localStorage: material.localStorage,
      sessionStorage: material.sessionStorage,
    });
    await contents.executeJavaScriptInIsolatedWorld(998, [
      {
        code: `(() => {
      const data = ${storage};
      if (location.origin !== data.origin) throw new Error('Website changed.');
      for (const category of ['localStorage', 'sessionStorage']) for (const entry of data[category]) window[category].setItem(entry.name, entry.value);
    })()`,
      },
    ]);
    for (const cookie of material.cookies) await contents.session.cookies.set(cookie);
    await contents.session.cookies.flushStore();
    contents.session.flushStorageData();
    await debuggerAPI.sendCommand('Fetch.disable');
    await debuggerAPI.sendCommand('Network.setBypassServiceWorker', { bypass: false });
    await loadPage(contents, url);
  } finally {
    debuggerAPI.removeListener('message', pause);
    if (debuggerAPI.isAttached()) {
      await debuggerAPI.sendCommand('Fetch.disable').catch(() => {});
      await debuggerAPI
        .sendCommand('Network.setBypassServiceWorker', { bypass: false })
        .catch(() => {});
      debuggerAPI.detach();
    }
  }
}

async function loadPage(contents: WebContents, url: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      contents.loadURL(url),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          if (!contents.isDestroyed()) contents.stop();
          reject(new Error('Website loading timed out.'));
        }, 25_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
