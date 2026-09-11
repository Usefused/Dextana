const controlRecentDownloads = new Map();

function controlDownloadFilename(value) {
  const name = String(value || 'download')
    .split(/[\\/]/)
    .pop()
    .replace(/[\x00-\x1f\x7f]/g, '');
  return name.slice(0, 240) || 'download';
}

function controlDownloadState(item) {
  if (item.state === 'complete') return 'completed';
  if (item.state === 'interrupted')
    return item.error === 'USER_CANCELED' ? 'cancelled' : 'interrupted';
  return 'progressing';
}

function controlDownloadPublic(record) {
  return {
    tabId: record.tabId,
    filename: record.filename,
    state: record.state,
    receivedBytes: Math.max(0, Number(record.receivedBytes) || 0),
    totalBytes: Math.max(0, Number(record.totalBytes) || 0),
    ...(record.state === 'completed' && record.path ? { path: record.path } : {}),
    ...(record.message ? { message: record.message } : {}),
  };
}

function controlDownloadRecords(session) {
  return [...session.downloads.values()].map(controlDownloadPublic);
}

function controlStopDownloadUpdates(session) {
  clearTimeout(session.downloadTimer);
  session.downloadTimer = undefined;
}

function controlDownloadChanged(session) {
  if (session.stopped || session.downloadTimer) return;
  session.downloadTimer = setTimeout(() => {
    session.downloadTimer = undefined;
    if (!session.stopped) void controlPublish(session).catch(() => controlReconnecting(session));
  }, 150);
}

function controlDownloadMatch(record, item) {
  return (
    record.nativeId === undefined &&
    [item.url, item.finalUrl].includes(record.url) &&
    Math.abs(Date.parse(item.startTime || 0) - record.startedAt) < 10_000
  );
}

function controlBindDownload(record, item) {
  controlRecentDownloads.delete(item.id);
  record.nativeId = item.id;
  if (record.filename === 'download') record.filename = controlDownloadFilename(item.filename);
  record.state = controlDownloadState(item);
  record.receivedBytes = item.bytesReceived;
  record.totalBytes = item.totalBytes > 0 ? item.totalBytes : Math.max(0, item.fileSize);
  record.path = record.state === 'completed' ? item.filename : undefined;
  record.message =
    record.state === 'interrupted'
      ? 'Download failed. Check the browser download list before trying again.'
      : record.state === 'cancelled'
        ? 'Download cancelled.'
        : undefined;
}

function controlTrimDownloads(session) {
  while (session.downloads.size > 100) {
    const entry = [...session.downloads.entries()].find(([, item]) => item.state !== 'progressing');
    if (!entry) break;
    session.downloads.delete(entry[0]);
  }
}

function controlObserveDownload(session, source, params) {
  const tab = [...session.tabs.values()].find(
    (item) => item.tabId === source.tabId && !item.closed,
  );
  if (!tab || typeof params.guid !== 'string') return;
  const current = session.downloads.get(params.guid);
  if (current) {
    current.receivedBytes = params.receivedBytes;
    current.totalBytes = params.totalBytes;
    if (params.state === 'completed') current.state = 'completed';
    else if (params.state === 'canceled') {
      current.state = 'cancelled';
      current.message = 'Download cancelled.';
    }
    if (current.state === 'completed' && current.nativeId === undefined)
      for (const item of controlRecentDownloads.values())
        if (controlDownloadMatch(current, item)) controlBindDownload(current, item);
    controlDownloadChanged(session);
    return;
  }
  if (typeof params.url !== 'string' || params.url.length > 8192 || !/^https?:/.test(params.url))
    return;
  const record = {
    guid: params.guid,
    url: params.url,
    tabId: tab.id,
    startedAt: Date.now(),
    filename: controlDownloadFilename(params.suggestedFilename),
    state: 'progressing',
    receivedBytes: 0,
    totalBytes: 0,
  };
  session.downloads.set(params.guid, record);
  for (const item of controlRecentDownloads.values())
    if (controlDownloadMatch(record, item)) controlBindDownload(record, item);
  controlTrimDownloads(session);
  controlDownloadChanged(session);
}

async function controlRefreshDownload(session, delta) {
  const record = [...session.downloads.values()].find((item) => item.nativeId === delta.id);
  if (!record) return;
  const [item] = await chrome.downloads.search({ id: delta.id });
  if (!item) return;
  controlBindDownload(record, item);
  controlDownloadChanged(session);
}

function controlWatchDownloads(currentSession) {
  chrome.debugger.onEvent.addListener((source, method, params) => {
    const session = currentSession();
    if (!session || !['Page.downloadWillBegin', 'Page.downloadProgress'].includes(method)) return;
    controlObserveDownload(session, source, params);
  });
  chrome.downloads.onCreated.addListener((item) => {
    const session = currentSession();
    if (!session) return;
    controlRecentDownloads.set(item.id, item);
    for (const record of session.downloads.values()) {
      if (controlDownloadMatch(record, item)) {
        controlBindDownload(record, item);
        controlDownloadChanged(session);
        break;
      }
    }
    for (const [id, recent] of controlRecentDownloads)
      if (Date.now() - Date.parse(recent.startTime || 0) > 15_000)
        controlRecentDownloads.delete(id);
  });
  chrome.downloads.onChanged.addListener((delta) => {
    const session = currentSession();
    if (session) void controlRefreshDownload(session, delta).catch(() => {});
  });
}
