import { BrowserWindow, WebContentsView } from 'electron';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

export function browserURL(value: unknown): string {
  if (typeof value !== 'string') throw new Error('A browser URL is required.');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Browser pages must use HTTP or HTTPS without embedded credentials.');
  return url.href;
}

// Fixed code runs in an isolated JS world. Model output is always encoded as data.
const readPage = `(() => {
  const nodes = [...document.querySelectorAll('a,button,input,textarea,select,[role="button"]')].filter(e => e.getBoundingClientRect().width && e.getBoundingClientRect().height).slice(0,150);
  globalThis.__dextanaElements = nodes;
  return { title: document.title, url: location.href, text: document.body.innerText.slice(0,24000), elements: nodes.map((e,i) => ({ ref: String(i+1), tag: e.tagName.toLowerCase(), label: (e.getAttribute('aria-label') || e.innerText || e.labels?.[0]?.innerText || e.getAttribute('placeholder') || e.getAttribute('name') || '').slice(0,180), type: e.getAttribute('type') || '', value: e.type === 'password' ? '[redacted]' : (e.value || '').slice(0,200) })) };
})()`;

const cursor = `(() => {
  let host = document.querySelector('[data-dextana-cursor]');
  if (!host) {
    host = document.createElement('div'); host.setAttribute('data-dextana-cursor','');
    host.style.cssText='position:fixed;left:24px;top:30px;width:28px;height:34px;z-index:2147483647;pointer-events:none;transition:left 240ms ease,top 240ms ease;filter:drop-shadow(0 2px 3px #0004)';
    const shadow = host.attachShadow({mode:'closed'});
    shadow.innerHTML='<svg width="28" height="34" viewBox="0 0 28 34" xmlns="http://www.w3.org/2000/svg"><path d="M3 2 L3 26 L10 20 L15 31 L21 28 L16 18 L25 17 Z" fill="#386e50" stroke="white" stroke-width="2" stroke-linejoin="round"/></svg><span style="position:absolute;left:25px;top:23px;background:#386e50;color:white;font:10px -apple-system,sans-serif;padding:4px 7px;border-radius:5px;white-space:nowrap">Dextana</span>';
    document.documentElement.appendChild(host);
  }
  globalThis.__dextanaCursor = host;
})()`;

export class Browsers {
  private windows = new Map<string, WebContentsView>();
  private active?: WebContentsView;
  private selectedId?: string;
  private reopening = new Map<string, Promise<void>>();
  constructor(
    private host: () => BrowserWindow,
    private changed: (browser?: { activityId: string; url: string }) => void,
    private bookmarks?: { get: (id: string) => string | undefined; remember: (id: string, url: string, needsReopen?: boolean) => void },
  ) {}
  private resize = () => {
    const [width, height] = this.host().getContentSize();
    // Keep in sync with the sidebar breakpoint and --browser-width in style.css.
    const sidebarWidth = width <= 1050 ? 215 : 248;
    const browserWidth = Math.max(320, Math.min(480, width - sidebarWidth - 380));
    this.active?.setBounds({
      x: width - browserWidth,
      y: 132,
      width: browserWidth,
      height: Math.max(100, height - 132),
    });
  };
  private get(id: string) {
    let window = this.windows.get(id);
    if (!window || window.webContents.isDestroyed()) {
      window = new WebContentsView({
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          partition: `persist:dextana-browser-${createHash('sha256').update(id).digest('hex')}`,
          webSecurity: true,
        },
      });
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      const session = window.webContents.session;
      session.setPermissionRequestHandler((_wc, _p, callback) => callback(false));
      session.setPermissionCheckHandler(() => false);
      session.on('will-download', (event) => event.preventDefault());
      session.webRequest.onBeforeRequest((details, callback) => {
        const protocol = new URL(details.url).protocol;
        callback({
          cancel: !['https:', 'http:', 'data:', 'blob:', 'about:', 'ws:', 'wss:'].includes(
            protocol,
          ),
        });
      });
      window.webContents.on('will-navigate', (event, url) => {
        try {
          browserURL(url);
        } catch {
          event.preventDefault();
        }
      });
      window.webContents.on('will-redirect', (event, url) => {
        try {
          browserURL(url);
        } catch {
          event.preventDefault();
        }
      });
      window.webContents.on('did-navigate', (_event, url) => {
        this.remember(id, url);
        if (this.active === window) this.changed({ activityId: id, url });
      });
      window.webContents.on('did-navigate-in-page', (_event, url) => {
        this.remember(id, url);
        if (this.active === window) this.changed({ activityId: id, url });
      });
      this.windows.set(id, window);
    }
    return window;
  }
  private remember(id: string, url: string, needsReopen = false) {
    try { this.bookmarks?.remember(id, browserURL(url), needsReopen); } catch { /* Do not save internal/error pages. */ }
  }
  async reopen(id: string) {
    if (this.selectedId !== id) throw new Error('Select this chat before opening its browser.');
    const pending = this.reopening.get(id);
    if (pending) return pending;
    const current = this.windows.get(id);
    if (current && !current.webContents.isDestroyed()) { this.show(id); return; }
    const url = browserURL(this.bookmarks?.get(id));
    const view = this.get(id);
    const opening = (async () => {
      try {
        await view.webContents.loadURL(url);
        await view.webContents.executeJavaScriptInIsolatedWorld(999, [{ code: cursor }]);
        this.remember(id, view.webContents.getURL());
        if (this.selectedId === id) this.show(id);
      } catch {
        if (this.active === view) this.hide();
        if (!view.webContents.isDestroyed()) view.webContents.close();
        this.windows.delete(id);
        this.remember(id, url, true);
        throw new Error('Could not reopen this page. It may be unavailable or expired. Try again, or ask Dextana to open the site’s starting page.');
      }
    })();
    this.reopening.set(id, opening);
    try { await opening; } finally { this.reopening.delete(id); }
  }
  async execute(id: string, args: Record<string, unknown>, signal: AbortSignal) {
    signal.throwIfAborted();
    if (!['open', 'read', 'click', 'fill', 'clear_cookies'].includes(String(args.action)))
      throw new Error('Unsupported browser action.');
    if (args.action !== 'open' && !this.windows.has(id))
      throw new Error('Open a page before using the browser.');
    const reopening = this.reopening.get(id);
    if (reopening) await reopening;
    signal.throwIfAborted();
    const window = this.get(id);
    if (this.selectedId === id) this.show(id);
    const abort = () => {
      if (!window.webContents.isDestroyed()) window.webContents.stop();
    };
    signal.addEventListener('abort', abort, { once: true });
    try {
      if (args.action === 'clear_cookies') {
        await window.webContents.session.clearStorageData({ storages: ['cookies'] });
        signal.throwIfAborted();
        return {
          cookiesCleared: true,
          scope: 'activity',
          url: window.webContents.getURL(),
          message:
            'Cookies cleared for this activity only. The page was not reloaded. Open the desired URL to refresh its session state.',
        };
      }
      if (args.action === 'open') await window.webContents.loadURL(browserURL(args.url));
      await window.webContents.executeJavaScriptInIsolatedWorld(999, [{ code: cursor }]);
      if (args.action === 'click' || args.action === 'fill') {
        if (typeof args.ref !== 'string' || !/^[1-9]\d{0,2}$/.test(args.ref))
          throw new Error('Use an element reference from the last browser read.');
        if (args.action === 'fill' && (typeof args.text !== 'string' || args.text.length > 16000))
          throw new Error('Invalid form value.');
        const action = JSON.stringify({
          action: args.action,
          index: Number(args.ref) - 1,
          text: args.text ?? '',
        });
        await window.webContents.executeJavaScriptInIsolatedWorld(999, [
          {
            code: `(() => { const a=${action}; const el=globalThis.__dextanaElements?.[a.index]; if(!el || !el.isConnected) throw new Error('Element is stale. Read the page again.'); el.scrollIntoView({block:'center',inline:'nearest'}); const r=el.getBoundingClientRect(); const c=globalThis.__dextanaCursor; c.style.left=(r.left + Math.min(r.width/2,80))+'px'; c.style.top=(r.top+r.height/2)+'px'; })()`,
          },
        ]);
        await delay(280, undefined, { signal });
        signal.throwIfAborted();
        await window.webContents.executeJavaScriptInIsolatedWorld(999, [
          {
            code: `(() => { const a = ${action}; const el = globalThis.__dextanaElements?.[a.index]; if (!el || !el.isConnected) throw new Error('Element is stale. Read the page again.'); if(a.action === 'click') el.click(); else { if (!['INPUT','TEXTAREA','SELECT'].includes(el.tagName)) throw new Error('This element cannot be filled.'); el.value=a.text; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); } })()`,
          },
        ]);
      }
      signal.throwIfAborted();
      return await window.webContents.executeJavaScriptInIsolatedWorld(999, [{ code: readPage }]);
    } finally {
      signal.removeEventListener('abort', abort);
    }
  }
  show(id: string) {
    const view = this.windows.get(id);
    if (!view || view.webContents.isDestroyed())
      throw new Error('This activity has no open browser.');
    if (this.active === view) return;
    this.hide();
    this.active = view;
    this.host().contentView.addChildView(view);
    this.resize();
    this.host().on('resize', this.resize);
    this.changed({ activityId: id, url: view.webContents.getURL() });
  }
  select(id?: string) {
    this.selectedId = id;
    if (id && this.windows.has(id)) this.show(id);
    else this.hide();
  }
  hide() {
    if (this.active && !this.host().isDestroyed())
      this.host().contentView.removeChildView(this.active);
    this.active = undefined;
    if (!this.host().isDestroyed()) this.host().removeListener('resize', this.resize);
    this.changed();
  }
  async flush() {
    await Promise.all([...this.windows.values()].filter(view => !view.webContents.isDestroyed()).map(async view => {
      view.webContents.session.flushStorageData();
      await view.webContents.session.cookies.flushStore();
    }));
  }
  close() {
    this.hide();
    for (const view of this.windows.values())
      if (!view.webContents.isDestroyed()) view.webContents.close();
    this.windows.clear();
  }
}
