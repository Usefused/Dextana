/* The popup owns this module; no content script or website can request capture. */
(function (scope) {
  const categories = ['cookies', 'localStorage', 'sessionStorage'];
  function connection(code) {
    const match = /^(\d{1,5})\.([a-f0-9]{64})$/.exec(code.trim());
    if (!match || Number(match[1]) < 1 || Number(match[1]) > 65535)
      throw new Error('Paste the connection code from Dextana.');
    return { base: `http://127.0.0.1:${match[1]}`, token: match[2] };
  }
  async function request(target, path, payload) {
    const response = await fetch(target.base + path, {
      method: payload ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${target.token}`,
        ...(payload ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      const error = new Error(
        detail.error === 'extension_update_required'
          ? 'Reload the Dextana extension and reopen its popup. This extension version cannot confirm the requested browser access scope.'
          : 'Dextana could not accept the transfer. Check the destination tab and start a new connection.',
      );
      error.status = response.status;
      throw error;
    }
    return response.json();
  }
  async function current(chrome, expected) {
    const tab = await chrome.tabs.get(expected.id);
    if (tab.url !== expected.url || tab.incognito !== expected.incognito)
      throw new Error('The source tab changed. Connect again.');
    return tab;
  }
  async function capture(chrome, tab, selected, openSourceSite = false) {
    const origin = new URL(tab.url).origin;
    await current(chrome, tab);
    const payload = {
      origin,
      approved: true,
      selected,
      cookies: [],
      localStorage: [],
      sessionStorage: [],
    };
    if (openSourceSite) {
      const sourceUrl = new URL(tab.url);
      sourceUrl.search = '';
      sourceUrl.hash = '';
      payload.openSourceSite = true;
      payload.sourceUrl = sourceUrl.href;
    }
    if (selected.includes('cookies')) {
      const stores = await chrome.cookies.getAllCookieStores();
      const store = stores.find((value) => value.tabIds.includes(tab.id));
      if (!store) throw new Error('The source browser profile is unavailable.');
      const cookies = await chrome.cookies.getAll({ url: tab.url, storeId: store.id });
      payload.cookies = cookies.map((cookie) => {
        if (cookie.partitionKey)
          throw new Error('Partitioned cookies are not supported. Sign in directly in Dextana.');
        const result = {};
        for (const name of [
          'name',
          'value',
          'domain',
          'path',
          'secure',
          'httpOnly',
          'hostOnly',
          'sameSite',
          'expirationDate',
        ])
          if (cookie[name] !== undefined) result[name] = cookie[name];
        return result;
      });
    }
    const storage = selected.filter((name) => name !== 'cookies');
    if (storage.length) {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [0] },
        world: 'ISOLATED',
        func: (expectedOrigin, names) => {
          if (location.origin !== expectedOrigin) return null;
          const data = {};
          for (const name of names) {
            const store = window[name];
            if (store.length > 1000) return null;
            data[name] = Array.from({ length: store.length }, (_, i) => {
              const key = store.key(i);
              return { name: key, value: store.getItem(key) };
            });
          }
          return data;
        },
        args: [origin, storage],
      });
      if (!results[0]?.result) throw new Error('Site storage is unavailable. Try cookies only.');
      for (const name of storage) payload[name] = results[0].result[name];
    }
    await current(chrome, tab);
    if (new TextEncoder().encode(JSON.stringify(payload)).length > 4_000_000)
      throw new Error('This site has too much storage. Select fewer categories.');
    return payload;
  }
  scope.DextanaTransfer = { categories, connection, request, current, capture };
})(globalThis);
