const ui = (id) => document.getElementById(id);
const transfer = globalThis.DextanaTransfer;
let pending;
let busy = false;
ui('connect').onclick = async () => {
  ui('status').textContent = '';
  pending = undefined;
  ui('approval').hidden = true;
  ui('request').hidden = true;
  try {
    const target = transfer.connection(ui('code').value);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const info = await transfer.request(target, '/request');
    const requested = new URL(info.origin);
    if (!['http:', 'https:'].includes(requested.protocol) || requested.origin !== info.origin)
      throw new Error('Invalid requested website.');
    pending = { target, info };
    ui('destination').textContent = `Dextana: ${info.origin} in “${info.destination}”`;
    ui('request').hidden = false;
    if (!tab?.url || !/^https?:/.test(tab.url)) {
      ui('status').textContent =
        'Open the requested website, then reopen this extension to approve its login.';
      return;
    }
    const sourceOrigin = new URL(tab.url).origin;
    const differentSite = sourceOrigin !== info.origin;
    if (differentSite && !info.supportsSourceSite)
      throw new Error('Update Dextana to use a different signed-in website.');
    pending = { target, tab, info, differentSite };
    ui('destination').textContent = `Dextana: ${info.origin} in “${info.destination}”`;
    ui('source').textContent =
      `Your browser: ${sourceOrigin}${tab.incognito ? ' (private window)' : ''}`;
    ui('source-switch').hidden = !differentSite;
    ui('open-source-site').checked = false;
    ui('source-switch-label').textContent =
      ` Open ${sourceOrigin} in this Dextana tab and use its login instead.`;
    await chrome.storage.session.set({ connectionCode: ui('code').value.trim() });
    ui('approval').hidden = false;
  } catch (error) {
    ui('status').textContent = error.message || 'Could not connect to Dextana.';
  }
};
ui('approve').onclick = async () => {
  if (!pending?.tab || busy) return;
  const selected = transfer.categories.filter((name) => ui(name).checked);
  if (!selected.length) {
    ui('status').textContent = 'Select at least one category.';
    return;
  }
  const { target, tab, differentSite } = pending;
  if (differentSite && !ui('open-source-site').checked) {
    ui('status').textContent =
      'Approve opening the signed-in website, or use Open requested website.';
    return;
  }
  const origins = [new URL(tab.url).origin + '/*'];
  const permissions = selected.includes('cookies') ? ['cookies'] : [];
  busy = true;
  ui('approve').disabled = true;
  ui('connect').disabled = true;
  ui('cancel').disabled = true;
  try {
    // Permission must be requested synchronously from this explicit user gesture.
    const allowed = await chrome.permissions.request({ permissions, origins });
    if (!allowed) throw new Error('Browser access was declined. Nothing was transferred.');
    const material = await transfer.capture(chrome, tab, selected, differentSite);
    await transfer.current(chrome, tab);
    ui('status').textContent = 'Transferring…';
    await transfer.request(target, '/import', material);
    ui('status').textContent =
      'Transferred. Check the website in Dextana to confirm you’re signed in.';
  } catch (error) {
    ui('status').textContent =
      error.message || 'Transfer failed. Check Dextana before trying again.';
  } finally {
    pending = undefined;
    ui('request').hidden = true;
    await chrome.storage.session.remove('connectionCode');
    ui('approval').hidden = true;
    // Keep the permanent loopback permission, but release optional site access.
    await chrome.permissions
      .remove({
        permissions,
        origins: origins.filter(
          (origin) => !origin.startsWith('http://127.0.0.1:') && origin !== 'http://127.0.0.1/*',
        ),
      })
      .catch(() => {});
    busy = false;
    ui('approve').disabled = false;
    ui('connect').disabled = false;
    ui('cancel').disabled = false;
  }
};
ui('cancel').onclick = () => {
  void chrome.storage.session.remove('connectionCode');
  ui('request').hidden = true;
  pending = undefined;
  ui('approval').hidden = true;
  ui('status').textContent = 'Cancelled. Nothing was read or transferred.';
};

ui('open-requested').onclick = async () => {
  if (!pending || busy) return;
  try {
    await chrome.storage.session.set({ connectionCode: ui('code').value.trim() });
    await chrome.tabs.create({ url: pending.info.origin + '/', active: true });
  } catch {
    ui('status').textContent = 'Could not open the website. Try opening it in Chrome manually.';
  }
};
// Remember only the temporary pairing code when opening a website closes the
// action popup. Cookie and storage values are never saved by the extension.
void chrome.storage.session.get('connectionCode').then((saved) => {
  if (!ui('code').value && typeof saved.connectionCode === 'string')
    ui('code').value = saved.connectionCode;
});
