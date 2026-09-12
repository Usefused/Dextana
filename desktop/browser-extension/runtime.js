// Chrome can load new popup files while still using an older manifest/worker.
(function () {
  const reloadMessage =
    'Dextana’s extension needs to reload. Open extension settings and click Reload, then reopen it on your signed-in website and paste the code from Dextana again.';
  function unavailable() {
    document.getElementById('reload-extension').hidden = false;
    for (const id of ['connect', 'approve', 'control-approve'])
      document.getElementById(id).disabled = true;
    document.getElementById('status').textContent = reloadMessage;
    return new Error(reloadMessage);
  }
  async function send(message) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch {
      throw unavailable();
    }
  }
  async function ready() {
    const manifest = chrome.runtime.getManifest();
    if (
      manifest.background?.service_worker !== 'background.js' ||
      !manifest.optional_host_permissions?.includes('http://*/*')
    )
      throw unavailable();
    let timer;
    try {
      const result = await Promise.race([
        send({ action: 'health' }),
        new Promise((resolve) => {
          timer = setTimeout(() => resolve(null), 3000);
        }),
      ]);
      if (result?.protocol !== 3) throw unavailable();
    } finally {
      clearTimeout(timer);
    }
  }
  document.getElementById('reload-extension').onclick = async () => {
    try {
      await chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
    } catch {
      document.getElementById('status').textContent =
        'Open chrome://extensions in Chrome and reload Dextana’s extension, then connect again.';
    }
  };
  globalThis.DextanaRuntime = { send, ready };
})();
