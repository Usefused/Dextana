importScripts('transfer.js');
importScripts('site-scope.js');

// An approved transfer belongs to the extension, not the short-lived action popup.
// Only metadata/status is retained; captured login values stay in this operation.
let running = false;
let accessApproval;
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html')) return;
  if (message?.action === 'health') {
    respond({ protocol: 3 });
    return;
  }
  if (message?.action === 'status') {
    void chrome.storage.session.get('transferStatus').then(({ transferStatus }) => {
      respond(
        ['awaiting-access', 'transferring'].includes(transferStatus?.state) && !running
          ? {
              state: 'failed',
              error:
                'The transfer was interrupted. Check Dextana before starting a new connection.',
            }
          : (transferStatus ?? null),
      );
    });
    return true;
  }
  if (message?.action === 'cancel-access') {
    accessApproval?.abort();
    respond({ cancelled: !!accessApproval });
    return;
  }
  if (message?.action !== 'transfer') return;
  if (running) {
    respond({ error: 'A transfer is already running. Check Dextana.' });
    return;
  }
  running = true;
  void perform(message).then(respond, () =>
    respond({ error: 'Check the website in Dextana before trying again.' }),
  );
  return true;
});

// A still-loaded login-only manifest may not expose the debugger API yet.
if (chrome.debugger) importScripts('control-worker.js');

async function waitForAccess(requirements, signal) {
  const deadline = Date.now() + 60_000;
  while (!(await chrome.permissions.contains(requirements))) {
    if (signal.aborted) throw new Error('Browser access was declined. Nothing was transferred.');
    if (Date.now() >= deadline)
      throw new Error(
        'Browser approval timed out. Nothing was transferred. Reopen the extension to try again.',
      );
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (signal.aborted) throw new Error('Browser access was declined. Nothing was transferred.');
}

async function perform({ code, tab, selected, openSourceSite, awaitAccess }) {
  const transfer = globalThis.DextanaTransfer;
  let permissions = [],
    origins = [];
  // Chromium may suspend an idle worker while the destination website loads.
  const keepAlive = setInterval(() => {
    void chrome.runtime.getPlatformInfo();
  }, 20_000);
  try {
    const target = transfer.connection(code);
    if (
      !Array.isArray(selected) ||
      !selected.length ||
      selected.some((name) => !transfer.categories.includes(name))
    )
      throw new Error('Choose what to transfer first.');
    ({ origins, permissions } = globalThis.DextanaSites.loginAccess(tab.url, selected));
    if (awaitAccess === true) {
      accessApproval = new AbortController();
      await chrome.storage.session.set({ transferStatus: { state: 'awaiting-access' } });
      await waitForAccess({ permissions, origins }, accessApproval.signal);
      accessApproval = undefined;
    }
    if (!(await chrome.permissions.contains({ permissions, origins })))
      throw new Error('Browser access was declined. Nothing was transferred.');
    await chrome.storage.session.set({ transferStatus: { state: 'transferring' } });
    await chrome.storage.session.remove('connectionCode');
    const material = await transfer.capture(chrome, tab, selected, openSourceSite === true);
    await transfer.current(chrome, tab);
    await transfer.request(target, '/import', material);
    const result = { state: 'completed' };
    await chrome.storage.session.set({ transferStatus: result });
    return result;
  } catch (error) {
    const result = {
      state: 'failed',
      error: error.message || 'Transfer failed. Check Dextana before trying again.',
    };
    await chrome.storage.session.set({ transferStatus: result });
    return result;
  } finally {
    await chrome.permissions
      .remove({
        permissions,
        origins: origins.filter(
          (origin) => !origin.startsWith('http://127.0.0.1:') && origin !== 'http://127.0.0.1/*',
        ),
      })
      .catch(() => {});
    clearInterval(keepAlive);
    accessApproval = undefined;
    running = false;
  }
}
