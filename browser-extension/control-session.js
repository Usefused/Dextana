/* Pairing credentials stay in extension-owned storage, never in tab content or agent context. */
function controlSession(target, scope) {
  return {
    target,
    scope,
    tabs: new Map(),
    busy: new Map(),
    revision: 0,
    lastWake: Date.now(),
    lastInventory: 0,
    opening: 0,
    stopped: false,
    reconnecting: false,
    needsResume: false,
  };
}
let controlStorage = Promise.resolve();
function controlSave(session, rememberPairing = false) {
  controlStorage = controlStorage
    .catch(() => {})
    .then(() => saveControlState(session, rememberPairing));
  return controlStorage;
}
function controlForget() {
  controlStorage = controlStorage
    .catch(() => {})
    .then(async () => {
      await chrome.storage.session.remove('browserControlSession');
      await chrome.storage.local.remove('browserControlPairing');
    });
  return controlStorage;
}
async function saveControlState(session, rememberPairing) {
  if (session.stopped) return;
  await chrome.storage.session.set({
    browserControlStatus: controlStatus(session),
    browserControlSession: {
      target: session.target,
      scope: session.scope,
      revision: session.revision,
      tabs: [...session.tabs.values()].map(({ id, tabId, created, closed }) => ({
        id,
        tabId,
        created,
        closed,
      })),
    },
  });
  if (rememberPairing && session.scope === 'browser')
    await chrome.storage.local.set({
      browserControlPairing: { target: session.target, scope: session.scope },
    });
}
async function controlReconnecting(session) {
  if (session.stopped || session.reconnecting) return;
  session.reconnecting = true;
  session.needsResume = true;
  await controlSave(session);
}
async function controlResume(session) {
  await DextanaTransfer.request(session.target, '/resume', {
    revision: ++session.revision,
    tabs: [...session.tabs.values()].map(controlTabRecord),
  });
  session.needsResume = false;
  session.reconnecting = false;
  await controlSave(session);
}
async function restoreBrowserControl() {
  const epoch = controlEpoch;
  const cached = (await chrome.storage.session.get('browserControlSession')).browserControlSession;
  const stored =
    cached ?? (await chrome.storage.local.get('browserControlPairing')).browserControlPairing;
  if (!stored || epoch !== controlEpoch) return;
  // Re-parse the saved endpoint so restoration cannot become arbitrary network access.
  const port = new URL(stored.target.base).port;
  const target = DextanaTransfer.connection(`${port}.${stored.target.token}`);
  const session = controlSession(target, stored.scope === 'browser' ? 'browser' : 'tabs');
  session.revision = stored.revision || 0;
  await controlRestoreTabs(session, stored.tabs || []);
  if (epoch !== controlEpoch) return;
  browserControl = session;
  await controlReconnecting(session);
  await chrome.action.setBadgeText({ text: 'ON' });
  void controlLoop(session);
}

async function controlRestoreTabs(session, records) {
  const native = new Map(
    (await chrome.tabs.query({})).filter(controlEligibleTab).map((tab) => [tab.id, tab]),
  );
  for (const tab of records) {
    const current = native.get(tab.tabId);
    if (current && !tab.closed) await controlAddTab(session, current, tab.id, tab.created, false);
  }
}
