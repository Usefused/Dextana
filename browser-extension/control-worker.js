importScripts('control-actions.js', 'control-tabs.js', 'control-session.js');
let browserControl;
let attaching = false;
let stopping = false;
let controlEpoch = 0;
async function stopBrowserControl(message) {
  controlEpoch++;
  const session = browserControl;
  browserControl = undefined;
  if (!session) {
    await controlForget();
    return;
  }
  session.stopped = true;
  stopping = true;
  try {
    await finishControlStop(session, message);
  } finally {
    stopping = false;
  }
}
async function finishControlStop(session, message) {
  await chrome.action.setBadgeText({ text: '' });
  await controlForget();
  await Promise.all(
    [...session.tabs.values()]
      .filter((tab) => tab.attached)
      .map((tab) => chrome.debugger.detach({ tabId: tab.tabId }).catch(() => {})),
  );
  await DextanaTransfer.request(session.target, '/stop', {}).catch(() => {});
  await chrome.storage.session.set({ browserControlStatus: { state: 'stopped', message } });
}
async function controlReport(session, command, value) {
  try {
    await DextanaTransfer.request(session.target, '/result', {
      requestId: command.requestId,
      value,
    });
  } catch (error) {
    // A tab closed while a response was in flight. Do not cancel unrelated tab lanes.
    const active = await DextanaTransfer.request(
      session.target,
      `/active?requestId=${command.requestId}`,
    );
    if (active.requestId) throw error;
  }
}
async function controlRun(session, command) {
  if (session.busy.has(command.tabId))
    return controlReport(session, command, { error: 'This tab is already working.' });
  session.busy.set(command.tabId, command.requestId);
  try {
    let value;
    try {
      value =
        command.action === 'new_tab'
          ? await controlOpenTab(session, command)
          : await controlWorkInTab(session, command);
    } catch (error) {
      value = { error: error.message };
    }
    session.busy.delete(command.tabId);
    if (!session.stopped) {
      await controlReport(session, command, value);
      await controlPublish(session);
    }
  } catch {
    if (browserControl === session) await controlReconnecting(session);
  } finally {
    if (session.busy.get(command.tabId) === command.requestId) session.busy.delete(command.tabId);
  }
}
async function controlWorkInTab(session, command) {
  const target = controlTarget(session, command);
  await controlActive(target);
  await controlEnsureAttached(session, target.tab);
  return controlExecute(target, command);
}
// A paired browser can be idle with no debugger attachment. Native API calls
// keep the worker alive while checkpoints also support an actual worker restart.
async function controlKeepAlive(session) {
  if (Date.now() - session.lastWake < 20_000) return;
  await chrome.action.getBadgeText({});
  session.lastWake = Date.now();
}
async function controlLoop(session) {
  while (!session.stopped) {
    try {
      await controlKeepAlive(session);
      if (session.needsResume) await controlResume(session);
      await controlSyncTabs(session);
      const next = await DextanaTransfer.request(session.target, '/next');
      if (next.command) void controlRun(session, next.command);
      await new Promise((resolve) => setTimeout(resolve, 250));
    } catch (error) {
      if (browserControl !== session) return;
      if (error.status === 403 || error.status === 410) {
        await stopBrowserControl(
          'Browser access was revoked in Dext. Activate a new code to reconnect.',
        );
        return;
      }
      await controlReconnecting(session);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}
async function attachBrowserControl(message) {
  if (browserControl || attaching || stopping)
    throw new Error('Stop the current browser connection first.');
  attaching = true;
  try {
    return await attachControl(message, controlEpoch);
  } finally {
    attaching = false;
  }
}
async function selectedControlTabs(message) {
  if (message.scope === 'browser') {
    const tabs = (await chrome.tabs.query({})).filter(controlEligibleTab);
    if (tabs.length > 1000) throw new Error('This browser has more than 1000 supported tabs.');
    return tabs;
  }
  if (!Array.isArray(message.tabs) || message.tabs.length > 12)
    throw new Error('Select up to twelve existing tabs, or let Dext open its own.');
  if (new Set(message.tabs.map((tab) => tab.id)).size !== message.tabs.length)
    throw new Error('Select each tab once.');
  const tabs = [];
  for (const selected of message.tabs) {
    const native = controlWebTab(await chrome.tabs.get(selected.id));
    if (native.url !== selected.url) throw new Error('A selected tab changed. Connect again.');
    tabs.push(native);
  }
  return tabs;
}
async function attachControl(message, epoch) {
  if (message.protocol !== 4 || !['browser', 'tabs'].includes(message.scope))
    throw new Error(
      'Reload the Dextana extension and reopen this popup before activating browser access.',
    );
  const target = DextanaTransfer.connection(message.code);
  const tabs = await selectedControlTabs(message);
  if (epoch !== controlEpoch) throw new Error('Browser control stopped.');
  const session = controlSession(target, message.scope === 'browser' ? 'browser' : 'tabs');
  browserControl = session;
  try {
    for (const tab of tabs)
      await controlAddTab(session, tab, crypto.randomUUID(), false, session.scope !== 'browser');
    await DextanaTransfer.request(target, '/attach', {
      protocol: 4,
      approved: true,
      allowNewTabs: true,
      scope: session.scope,
      tabs: [...session.tabs.values()].map(controlTabRecord),
    });
    if (session.stopped) throw new Error('Browser control stopped.');
    const status = controlStatus(session);
    await controlSave(session, true);
    if (session.stopped) throw new Error('Browser control stopped.');
    await chrome.action.setBadgeText({ text: 'ON' });
    await chrome.action.setBadgeBackgroundColor({ color: '#386e50' });
    void controlLoop(session);
    return status;
  } catch (error) {
    await stopBrowserControl('The tabs could not connect.');
    throw error;
  }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html')) return;
  if (message.action === 'control-status') {
    void restoringControl.then(() =>
      respond(browserControl ? controlStatus(browserControl) : { state: 'stopped' }),
    );
    return true;
  }
  if (message.action === 'control-stop') {
    void stopBrowserControl('Stopped from your browser.').then(() => respond({ state: 'stopped' }));
    return true;
  }
  if (message.action !== 'control-attach') return;
  void restoringControl
    .then(() => attachBrowserControl(message))
    .then(respond, (error) => respond({ error: error.message }));
  return true;
});
chrome.debugger.onDetach.addListener((source, reason) => {
  if (!browserControl) return;
  if (reason === 'canceled_by_user') void stopBrowserControl('Browser control stopped in Chrome.');
  else void controlLostTab(browserControl, source.tabId);
});
chrome.tabs.onRemoved.addListener((id) => {
  if (browserControl) void controlLostTab(browserControl, id);
});
chrome.tabs.onUpdated.addListener((id, change, native) => {
  if (!browserControl || (!change.url && !change.title)) return;
  const session = browserControl;
  const tab = [...session.tabs.values()].find((tab) => tab.tabId === id && !tab.closed);
  if (!tab) return;
  try {
    controlWebTab(native);
  } catch {
    void controlLostTab(session, id);
    return;
  }
  tab.url = native.url;
  tab.title = (native.title || 'Untitled page').slice(0, 1000);
  void controlPublish(session).catch(() => {});
});

const restoringControl = restoreBrowserControl().catch(() =>
  stopBrowserControl('Browser access could not be restored.'),
);
