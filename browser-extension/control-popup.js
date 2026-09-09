(function () {
  let pending;
  const control = document.getElementById('browser-control');
  const detail = document.getElementById('control-detail');
  const list = document.getElementById('control-tabs');
  const approve = document.getElementById('control-approve');
  const stop = document.getElementById('control-stop');
  const selectionControls = document.getElementById('control-selection');
  const selectAll = document.getElementById('control-select-all');
  const clearSelection = document.getElementById('control-clear-selection');
  const selectionCount = document.getElementById('control-selection-count');
  const tabLimit = 12;
  const granular = document.getElementById('control-granular');
  const granularOption = document.getElementById('control-granular-option');
  function updateSelection() {
    const total = list.querySelectorAll('input').length;
    const selected = list.querySelectorAll('input:checked').length;
    selectAll.textContent = total > tabLimit ? `Select first ${tabLimit}` : 'Select all';
    selectAll.disabled = total === 0;
    clearSelection.disabled = selected === 0;
    approve.disabled = granular.checked && selected > tabLimit;
    selectionCount.textContent = `${selected} of ${total} selected · ${tabLimit} maximum`;
  }
  function selectTabs(selected) {
    // Bulk selection follows the same connection limit as individual approval.
    [...list.querySelectorAll('input')].forEach((input, index) => {
      input.checked = selected && index < tabLimit;
    });
    updateSelection();
  }
  selectAll.onclick = () => selectTabs(true);
  clearSelection.onclick = () => selectTabs(false);
  list.onchange = updateSelection;
  granular.onchange = () => {
    selectionControls.hidden = !granular.checked;
    list.hidden = !granular.checked;
    approve.textContent = granular.checked
      ? 'Allow selected tabs and new tabs'
      : 'Activate browser access';
    updateSelection();
  };
  function show(status) {
    if (status?.state !== 'connected') {
      if (pending) return;
      control.hidden = true;
      if (status?.message) document.getElementById('status').textContent = status.message;
      return;
    }
    pending = undefined;
    control.hidden = false;
    approve.hidden = true;
    stop.hidden = false;
    selectionControls.hidden = true;
    granularOption.hidden = true;
    list.hidden = false;
    list.replaceChildren();
    detail.textContent = status.reconnecting
      ? 'Reconnecting to Dext automatically. Your browser access remains paired.'
      : status.scope === 'browser'
        ? 'Browser access is active for all regular tabs, including tabs opened later. Dext connects to each tab when needed. Stop revokes access.'
        : status.tabs.length
          ? `Dext is connected to ${status.tabs.length} tabs. Stop ends control of all connected tabs.`
          : 'Connected. Dext can now request approval to open its own task tabs. Your existing tabs are not attached.';
    for (const tab of status.tabs) {
      const row = document.createElement('p');
      row.textContent = tab.title;
      row.title = tab.url;
      list.append(row);
    }
  }
  function selection(tabs) {
    list.replaceChildren();
    for (const tab of tabs) {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = String(tab.id);
      checkbox.checked = false;
      const text = document.createElement('span');
      text.textContent = tab.title || new URL(tab.url).host;
      label.title = tab.url;
      label.append(checkbox, text);
      list.append(label);
    }
    granular.checked = false;
    granularOption.hidden = false;
    granular.onchange();
  }
  globalThis.DextanaControlUI = {
    async restore() {
      if (chrome.runtime.getManifest().permissions.includes('debugger'))
        show(await globalThis.DextanaRuntime.send({ action: 'control-status' }));
    },
    async connect(code, info) {
      if (info.protocol !== 4 || !chrome.runtime.getManifest().permissions.includes('tabs'))
        throw new Error(
          'Update Dextana, refresh the extension folder and reload the extension before activating browser access.',
        );
      const tabs = (await chrome.tabs.query({})).filter(
        (item) => !item.incognito && /^https?:/.test(item.url || ''),
      );
      pending = { code, tabs };
      document.getElementById('approval').hidden = true;
      document.getElementById('request').hidden = true;
      control.hidden = false;
      approve.hidden = false;
      stop.hidden = true;
      selection(tabs);
      detail.textContent = `Activate browser access for Dext to work in your regular browser tabs and open new ones. Access stays connected between tasks and can be reused by your other chats through their approval settings. Turn on Granular control to limit this connection to selected tabs for “${info.destination}”. Stop revokes access. Private windows and browser settings pages are excluded.`;
    },
  };
  approve.onclick = async () => {
    if (!pending) return;
    approve.disabled = true;
    try {
      const ids = new Set(
        [...list.querySelectorAll('input:checked')].map((input) => Number(input.value)),
      );
      if (granular.checked && ids.size > tabLimit) throw new Error('Select up to twelve tabs.');
      const tabs = pending.tabs
        .filter((tab) => ids.has(tab.id))
        .map((tab) => ({ id: tab.id, url: tab.url }));
      const status = await globalThis.DextanaRuntime.send({
        action: 'control-attach',
        protocol: 4,
        code: pending.code,
        scope: granular.checked ? 'tabs' : 'browser',
        tabs,
      });
      if (status.error) throw new Error(status.error);
      await chrome.storage.session.remove(['connectionCode', 'transferStatus']);
      show(status);
    } catch (error) {
      document.getElementById('status').textContent = error.message;
    } finally {
      approve.disabled = false;
    }
  };
  stop.onclick = async () => {
    try {
      await globalThis.DextanaRuntime.send({ action: 'control-stop' });
      control.hidden = true;
      document.getElementById('status').textContent = 'Browser control stopped.';
    } catch (error) {
      document.getElementById('status').textContent = error.message;
    }
  };
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes.browserControlStatus)
      show(changes.browserControlStatus.newValue);
  });
})();
