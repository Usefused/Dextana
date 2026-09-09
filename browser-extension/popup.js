const ui = (id) => document.getElementById(id);
const transfer = globalThis.DextanaTransfer;
let pending;
let busy = false;

function showTransfer(result) {
  if (!result) return;
  busy = result.state === 'transferring';
  for (const name of ['approve', 'connect', 'cancel', 'open-requested']) ui(name).disabled = busy;
  ui('pairing').hidden = busy;
  ui('request').hidden = true;
  ui('approval').hidden = true;
  pending = undefined;
  ui('status').textContent = busy
    ? 'Transferring… You can return to Dextana.'
    : result.state === 'completed'
      ? 'Transferred. Check the website in Dextana to confirm you’re signed in.'
      : result.error || 'Transfer was interrupted. Check Dextana before starting a new connection.';
}

async function connect() {
  if (busy) return;
  ui('status').textContent = '';
  pending = undefined;
  ui('approval').hidden = true;
  ui('request').hidden = true;
  ui('connect').disabled = true;
  try {
    const code = ui('code').value.trim();
    const target = transfer.connection(code);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const info = await transfer.request(target, '/request');
    const requested = new URL(info.origin);
    if (!['http:', 'https:'].includes(requested.protocol) || requested.origin !== info.origin)
      throw new Error('Invalid requested website.');
    // Save before branching: users often start on Chrome's new-tab page.
    await chrome.storage.session.set({ connectionCode: code });
    await chrome.storage.session.remove('transferStatus');
    pending = { target, info, code };
    ui('destination').textContent = `${info.origin} · ${info.destination}`;
    ui('request').hidden = false;
    ui('pairing').open = false;
    if (!tab?.url || !/^https?:/.test(tab.url)) {
      ui('status').textContent =
        'Open the website and sign in, then reopen this extension. Your connection is remembered.';
      return;
    }
    const sourceOrigin = new URL(tab.url).origin;
    const differentSite = sourceOrigin !== info.origin;
    if (differentSite && !info.supportsSourceSite)
      throw new Error('Update Dextana to use a different signed-in website.');
    pending = { target, tab, info, code, differentSite };
    ui('source').textContent = `From ${sourceOrigin}${tab.incognito ? ' (private window)' : ''}`;
    ui('source-switch').hidden = !differentSite;
    ui('open-source-site').checked = false;
    ui('source-switch-label').textContent =
      ` Open ${sourceOrigin} in Dextana and use its login instead.`;
    ui('approval').hidden = false;
  } catch (error) {
    pending = undefined;
    ui('request').hidden = true;
    ui('pairing').open = true;
    ui('status').textContent =
      error.message ||
      'Could not connect to Dextana. Keep the connection dialog open and try again.';
  } finally {
    ui('connect').disabled = false;
  }
}
ui('connect').onclick = connect;
ui('code').onkeydown = (event) => {
  if (event.key === 'Enter') void connect();
};

ui('approve').onclick = async () => {
  if (!pending?.tab || busy) return;
  const selected = transfer.categories.filter((name) => ui(name).checked);
  if (!selected.length) {
    ui('status').textContent = 'Select at least one category.';
    return;
  }
  const { tab, code, differentSite } = pending;
  if (differentSite && !ui('open-source-site').checked) {
    ui('status').textContent =
      'Approve opening the signed-in website, or use Open requested website.';
    return;
  }
  busy = true;
  ui('approve').disabled = true;
  try {
    // This optional permission request stays in the explicit approval gesture.
    const allowed = await chrome.permissions.request({
      permissions: selected.includes('cookies') ? ['cookies'] : [],
      origins: [new URL(tab.url).origin + '/*'],
    });
    if (!allowed) throw new Error('Browser access was declined. Nothing was transferred.');
    const completion = chrome.runtime.sendMessage({
      action: 'transfer',
      code,
      tab,
      selected,
      openSourceSite: differentSite,
    });
    showTransfer({ state: 'transferring' });
    showTransfer(await completion);
  } catch (error) {
    if (pending) {
      busy = false;
      ui('approve').disabled = false;
      ui('status').textContent = error.message || 'Check Dextana before trying again.';
    } else showTransfer({ state: 'failed', error: error.message });
  }
};
ui('cancel').onclick = async () => {
  if (busy) return;
  await chrome.storage.session.remove(['connectionCode', 'transferStatus']);
  pending = undefined;
  ui('code').value = '';
  ui('pairing').open = true;
  ui('request').hidden = true;
  ui('approval').hidden = true;
  ui('status').textContent = 'Cancelled. Nothing was read or transferred.';
};
ui('open-requested').onclick = async () => {
  if (!pending || busy) return;
  try {
    await chrome.storage.session.set({ connectionCode: pending.code });
    await chrome.tabs.create({ url: pending.info.origin + '/', active: true });
  } catch {
    ui('status').textContent = 'Could not open the website. Try opening it in Chrome manually.';
  }
};
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes.transferStatus?.newValue)
    showTransfer(changes.transferStatus.newValue);
});
// Reconnect metadata on every popup opening; capture still requires fresh approval.
void chrome.storage.session
  .get(['connectionCode', 'transferStatus'])
  .then(async (saved) => {
    if (ui('code').value) return;
    if (saved.transferStatus) {
      showTransfer(await chrome.runtime.sendMessage({ action: 'status' }));
      return;
    }
    if (typeof saved.connectionCode === 'string') {
      ui('code').value = saved.connectionCode;
      await connect();
    }
  })
  .catch(() => {
    ui('status').textContent = 'Paste your connection code to continue.';
  });
