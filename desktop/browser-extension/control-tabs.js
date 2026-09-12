/* Public handles are connection-scoped; native tab IDs never leave the extension. */
function controlWebTab(tab) {
  if (!tab || tab.incognito || !/^https?:/.test(tab.url || ''))
    throw new Error('Choose a regular HTTP or HTTPS tab.');
  if (tab.url.length > 8192) throw new Error('This tab address is too long.');
  const url = new URL(tab.url);
  if (url.username || url.password)
    throw new Error('Choose a website address without embedded credentials.');
  return tab;
}
function controlTabRecord(tab) {
  return {
    id: tab.id,
    title: tab.title,
    url: tab.url,
    state: tab.closed ? 'closed' : 'connected',
    created: tab.created,
  };
}
function controlStatus(session) {
  const tabs = [...session.tabs.values()].filter((tab) => !tab.closed).map(controlTabRecord);
  return {
    state: 'connected',
    scope: session.scope,
    reconnecting: !!session.reconnecting,
    title: `${tabs.length} browser tabs`,
    tabs,
  };
}
async function controlPublish(session) {
  if (session.stopped) return;
  await DextanaTransfer.request(session.target, '/tabs', {
    revision: ++session.revision,
    tabs: [...session.tabs.values()].map(controlTabRecord),
    downloads: controlDownloadRecords(session),
  });
  for (const [id, tab] of session.tabs)
    if (tab.closed && !session.busy.has(id)) session.tabs.delete(id);
  if (!session.stopped) await controlSave(session);
}
async function controlAddTab(session, native, id, created, attach = true) {
  controlWebTab(native);
  if (session.stopped) throw new Error('Browser control stopped.');
  const tab = {
    id,
    tabId: native.id,
    title: (native.title || 'Untitled page').slice(0, 1000),
    url: native.url,
    created,
    closed: false,
    attached: false,
  };
  session.tabs.set(id, tab);
  if (attach) await controlEnsureAttached(session, tab);
  return tab;
}
async function controlEnsureAttached(session, tab) {
  if (tab.attached) return;
  if (session.stopped || tab.closed) throw new Error('Browser control stopped.');
  try {
    await chrome.debugger.attach({ tabId: tab.tabId }, '1.3');
  } catch (error) {
    // A restarted worker may still own the native debugger attachment.
    await chrome.debugger.sendCommand({ tabId: tab.tabId }, 'Page.getFrameTree', {}).catch(() => {
      throw error;
    });
  }
  await chrome.debugger.sendCommand({ tabId: tab.tabId }, 'Page.enable', {});
  tab.attached = true;
  if (session.stopped || tab.closed) {
    await chrome.debugger.detach({ tabId: tab.tabId }).catch(() => {});
    throw new Error('Browser control stopped.');
  }
}

async function controlLostTab(session, nativeId) {
  const tab = [...session.tabs.values()].find((tab) => tab.tabId === nativeId);
  if (!tab || tab.closed) return;
  tab.closed = true;
  await chrome.debugger.detach({ tabId: nativeId }).catch(() => {});
  await controlPublish(session).catch(() => {});
}
function controlTarget(session, command) {
  const tab = session.tabs.get(command.tabId);
  if (!tab || tab.closed) throw new Error('The requested tab is closed or not attached.');
  return {
    owner: session,
    tab,
    tabId: tab.tabId,
    target: session.target,
    commandId: command.requestId,
    get stopped() {
      return session.stopped || tab.closed;
    },
  };
}
async function controlOpenTab(session, command) {
  const permit = {
    target: session.target,
    commandId: command.requestId,
    get stopped() {
      return session.stopped;
    },
  };
  await controlActive(permit);
  if (
    [...session.tabs.values()].filter((tab) => !tab.closed).length >=
    (session.scope === 'browser' ? 1000 : 12)
  )
    throw new Error('This connection has reached its tab limit.');
  session.opening++;
  let native;
  try {
    native = await chrome.tabs.create({ url: command.arguments.url, active: false });
    const ready = await controlReadyTab(permit, native.id);
    const tab = await controlAddTab(session, ready, command.tabId, true);
    return { title: tab.title, url: tab.url, message: 'Opened a new tab. Read it before acting.' };
  } catch (error) {
    // Only this unregistered, newly-created tab is rolled back; existing user tabs are untouched.
    if (native) await chrome.tabs.remove(native.id).catch(() => {});
    throw error;
  } finally {
    session.opening--;
  }
}
async function controlCloseTab(target) {
  if (!target.tab.created) throw new Error('Only Dext-created tabs can be closed by the agent.');
  await controlActive(target);
  await controlCurrent(target, target.commandURL);
  await chrome.tabs.remove(target.tabId);
  target.tab.closed = true;
  return { title: target.tab.title, url: target.tab.url, message: 'Closed the Dext-created tab.' };
}

async function controlReadyTab(permit, id) {
  for (let attempt = 0; attempt < 100; attempt++) {
    await controlActive(permit);
    const tab = await chrome.tabs.get(id);
    if (tab.status === 'complete' && /^https?:/.test(tab.url || '')) return tab;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('The new tab did not finish loading.');
}

async function controlSyncTabs(session) {
  if (session.scope !== 'browser' || session.opening || Date.now() - session.lastInventory < 2000)
    return;
  session.lastInventory = Date.now();
  const current = (await chrome.tabs.query({})).filter(controlEligibleTab);
  if (current.length > 1000) throw new Error('This browser has more than 1000 supported tabs.');
  const live = new Set(current.map((tab) => tab.id));
  for (const tab of session.tabs.values()) if (!live.has(tab.tabId)) tab.closed = true;
  for (const native of current) {
    const known = [...session.tabs.values()].find((tab) => tab.tabId === native.id && !tab.closed);
    if (known) {
      known.url = native.url;
      known.title = (native.title || 'Untitled page').slice(0, 1000);
    } else await controlAddTab(session, native, crypto.randomUUID(), false, false);
  }
  await controlPublish(session);
}
function controlEligibleTab(tab) {
  try {
    controlWebTab(tab);
    return true;
  } catch {
    return false;
  }
}
