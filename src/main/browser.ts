import { LoginOffer } from './login-offer';
import { BrowserWindow, WebContentsView } from 'electron';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { importLogin } from './import-login';
import { loginOrigin, type LoginMaterial } from './session-transfer';
import type { BrowserTab, BrowserPane } from '../shared/types';

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
  private loginOffer = new LoginOffer();
  private dismissedLogins = new Map<string, string>();
  private checkingLogin = false;
  private loginTimer = setInterval(() => { void this.checkLogin(); }, 1200);
  private transferOverlay = false;
  private importing = new Set<string>();
  private windows = new Map<string, WebContentsView>();
  private active?: WebContentsView;
  private selectedId?: string;
  private activeId?: string;
  private viewRequest = 0;
  private tabs = new Map<string, BrowserTab>();
  private defaults = new Map<string, string>();
  private viewed = new Map<string, string>();
  private busy = new Set<string>();
  private planOrigins = new Map<number, { origins: string[]; blocked?: string }>();
  private configuredSessions = new WeakSet<Electron.Session>();
  private reopening = new Map<string, Promise<void>>();
  constructor(
    private host: () => BrowserWindow,
    private changed: (browser?: BrowserPane) => void,
    private bookmarks: {
      list: () => BrowserTab[];
      defaultTab: (activityId: string) => string | undefined;
      save: (activityId: string, tabs: BrowserTab[], defaultTabId?: string) => void;
      parent: (activityId: string) => string | undefined;
    },
    private offerLogin?: (tabId: string) => void,
  ) {
    this.loginTimer.unref();
    for (const tab of bookmarks.list()) this.tabs.set(tab.id, { ...tab });
    for (const tab of this.tabs.values())
      this.defaults.set(tab.activityId, bookmarks.defaultTab(tab.activityId) ?? tab.id);
  }
  private async checkLogin() {
    const view = this.active, id = this.activeId;
    if (!view || !id || this.checkingLogin || this.transferOverlay || view.webContents.isDestroyed()) return;
    const url = view.webContents.getURL();
    if (this.busy.has(id) || this.dismissedLogins.get(id) === url) { this.loginOffer.close(); return; }
    this.checkingLogin = true;
    try {
      loginOrigin(url);
      const needed = await view.webContents.executeJavaScriptInIsolatedWorld(998, [{ code: `(() => {
        const visible = el => !!(el && el.getBoundingClientRect().width && el.getBoundingClientRect().height);
        return [...document.querySelectorAll('input[type="password"]')].some(visible)
          || [...document.querySelectorAll('h1,h2,[role="heading"]')].some(el => visible(el) && /^(sign in|log in|login)(\\b|$)/i.test(el.textContent.trim()))
          || /(?:sign|log) in to (?:continue|access)/i.test(document.body?.innerText.slice(0, 4000) || '');
      })()` }]);
      if (this.active !== view || this.activeId !== id || view.webContents.getURL() !== url || this.transferOverlay || this.busy.has(id)) return;
      if (!needed) { this.loginOffer.close(); return; }
      this.loginOffer.show(this.host(), view.getBounds(), action => {
        this.dismissedLogins.set(id, url);
        this.loginOffer.close();
        if (action === 'transfer' && this.activeId === id && view.webContents.getURL() === url) this.offerLogin?.(id);
      }, `${id}:${url}`);
    } catch { this.loginOffer.close(); }
    finally { this.checkingLogin = false; }
  }
  private positionLogin = () => { if (this.active) this.loginOffer.position(this.host(), this.active.getBounds()); };
  loginTarget(id: string) {
    const tab = this.tabs.get(id),
      view = this.windows.get(id);
    if (
      !tab ||
      !view ||
      view.webContents.isDestroyed() ||
      this.activeId !== id ||
      this.busy.has(id)
    )
      throw new Error('Open an idle website tab before transferring its login.');
    const url = view.webContents.getURL();
    return { id, activityId: tab.activityId, url, origin: loginOrigin(url) };
  }
  setTransferOverlay(visible: boolean) {
    this.transferOverlay = visible;
    if (visible) {
      this.loginOffer.close();
      if (this.activeId && this.active) this.dismissedLogins.set(this.activeId, this.active.webContents.getURL());
    }
    this.active?.setVisible(!visible);
  }
  async importLogin(target: ReturnType<Browsers['loginTarget']>, material: LoginMaterial) {
    const current = this.loginTarget(target.id);
    if (
      current.url !== target.url ||
      current.activityId !== target.activityId ||
      this.owned(target.activityId).some((tab) => this.busy.has(tab.id))
    )
      throw new Error('The destination changed or is working. Start a new transfer.');
    this.importing.add(target.activityId);
    this.busy.add(target.id);
    this.notify();
    try {
      await importLogin(this.windows.get(target.id)!.webContents, material.sourceUrl ?? target.url, material);
    } finally {
      this.importing.delete(target.activityId);
      this.busy.delete(target.id);
      this.notify();
    }
  }
  private owned(activityId: string) {
    return [...this.tabs.values()].filter((tab) => tab.activityId === activityId);
  }
  private persist(activityId: string) {
    this.bookmarks.save(
      activityId,
      this.owned(activityId).map((tab) => ({ ...tab })),
      this.defaults.get(activityId),
    );
    this.notify();
  }
  private notify() {
    const tab = this.activeId && this.tabs.get(this.activeId);
    this.changed(
      tab
        ? {
            activityId: tab.activityId,
            tabId: tab.id,
            url: tab.url,
            tabs: [...this.tabs.values()],
            busyTabIds: [...this.busy],
          }
        : undefined,
    );
  }
  private belongsToSelection(activityId: string): boolean {
    if (!this.selectedId) return false;
    const seen = new Set<string>();
    let id: string | undefined = activityId;
    while (id && !seen.has(id)) {
      if (id === this.selectedId) return true;
      seen.add(id);
      id = this.bookmarks.parent(id);
    }
    return false;
  }
  private create(activityId: string, url: string) {
    if (this.importing.has(activityId)) throw new Error('Wait for the login transfer to finish.');
    if (this.owned(activityId).length >= 12)
      throw new Error(
        'Close a browser tab before opening another. Each activity can have up to 12 tabs.',
      );
    const tab: BrowserTab = {
      id: randomUUID(),
      activityId,
      url: browserURL(url),
      title: new URL(url).hostname,
      needsReopen: true,
    };
    this.tabs.set(tab.id, tab);
    this.defaults.set(activityId, tab.id);
    this.persist(activityId);
    return tab;
  }
  private resize = () => {
    const [width, height] = this.host().getContentSize();
    // Keep in sync with the sidebar breakpoint and --browser-width in style.css.
    const sidebarWidth = width <= 1050 ? 215 : 248;
    const browserWidth = Math.max(320, Math.min(480, width - sidebarWidth - 380));
    this.active?.setBounds({
      x: width - browserWidth,
      y: 164,
      width: browserWidth,
      height: Math.max(100, height - 164),
    });
    this.positionLogin();
  };
  private get(id: string) {
    let window = this.windows.get(id);
    if (!window || window.webContents.isDestroyed()) {
      window = new WebContentsView({
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          partition: `persist:dextana-browser-${createHash('sha256').update(this.tabs.get(id)!.activityId).digest('hex')}`,
          webSecurity: true,
        },
      });
      // A tab stays detached and hidden until it is explicitly presented.
      window.setVisible(false);
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      const session = window.webContents.session;
      if (!this.configuredSessions.has(session)) {
        this.configuredSessions.add(session);
        session.setPermissionRequestHandler((_wc, _p, callback) => callback(false));
        session.setPermissionCheckHandler(() => false);
        session.on('will-download', (event) => event.preventDefault());
        session.webRequest.onBeforeRequest((details, callback) => {
          const protocol = new URL(details.url).protocol;
          const scope = details.webContentsId === undefined ? undefined : this.planOrigins.get(details.webContentsId);
          const outsidePlan = scope && details.resourceType === 'mainFrame' && !scope.origins.includes(new URL(details.url).origin);
          if (outsidePlan) scope.blocked = details.url;
          callback({
            cancel: !!outsidePlan || !['https:', 'http:', 'data:', 'blob:', 'about:', 'ws:', 'wss:'].includes(
              protocol,
            ),
          });
        });
      }
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
        this.notify();
      });
      window.webContents.on('did-navigate-in-page', (_event, url) => {
        this.remember(id, url);
        this.notify();
      });
      window.webContents.on('page-title-updated', (_event, title) => {
        const tab = this.tabs.get(id);
        if (tab) {
          tab.title = title.slice(0, 160) || new URL(tab.url).hostname;
          this.persist(tab.activityId);
        }
      });
      this.windows.set(id, window);
    }
    return window;
  }
  private remember(id: string, url: string, needsReopen = false) {
    const tab = this.tabs.get(id);
    if (!tab) return;
    try {
      url = browserURL(url);
    } catch {
      return;
    }
    tab.url = url;
    tab.needsReopen = needsReopen;
    this.persist(tab.activityId);
  }
  async reopen(activityId: string, tabId?: string) {
    if (this.importing.has(activityId)) throw new Error('Wait for the login transfer to finish.');
    const id = tabId ?? this.viewed.get(activityId) ?? this.defaults.get(activityId);
    const tab = id && this.tabs.get(id);
    if (!tab || tab.activityId !== activityId)
      throw new Error('This tab does not belong to this activity.');
    const selectedAtStart = this.selectedId;
    const request = ++this.viewRequest;
    // Explicit viewing never changes the agent's default target.
    this.viewed.set(activityId, tab.id);
    const current = this.windows.get(tab.id);
    if (current && !current.webContents.isDestroyed() && !this.reopening.has(tab.id)) {
      this.show(tab.id);
      return;
    }
    await this.loadSaved(tab);
    if (
      this.viewRequest === request &&
      this.selectedId === selectedAtStart &&
      this.viewed.get(activityId) === tab.id
    )
      this.show(tab.id);
  }
  private async loadSaved(tab: BrowserTab) {
    const pending = this.reopening.get(tab.id);
    if (pending) return pending;
    const view = this.get(tab.id);
    const url = tab.url;
    this.busy.add(tab.id);
    this.notify();
    const opening = (async () => {
      try {
        await view.webContents.loadURL(url);
        await view.webContents.executeJavaScriptInIsolatedWorld(999, [{ code: cursor }]);
        this.remember(tab.id, view.webContents.getURL());
      } catch {
        if (this.active === view) this.hide();
        if (!view.webContents.isDestroyed()) view.webContents.close();
        this.windows.delete(tab.id);
        this.remember(tab.id, url, true);
        throw new Error(
          'Could not reopen this page. It may be unavailable or expired. Try again, or ask Dextana to open the site’s starting page.',
        );
      }
    })();
    this.reopening.set(tab.id, opening);
    try {
      await opening;
    } finally {
      this.reopening.delete(tab.id);
      this.busy.delete(tab.id);
      this.notify();
    }
  }
  async newTab(activityId: string, url: string) {
    const previousDefault = this.defaults.get(activityId);
    const tab = this.create(activityId, browserURL(url));
    if (previousDefault) {
      this.defaults.set(activityId, previousDefault);
      this.persist(activityId);
    }
    await this.reopen(activityId, tab.id);
  }
  closeTab(id: string) {
    const tab = this.tabs.get(id);
    if (!tab) throw new Error('This browser tab is already closed.');
    if (this.busy.has(id))
      throw new Error(
        'This tab is working. Wait for the action to finish or stop its activity before closing it.',
      );
    const wasActive = this.activeId === id;
    const view = this.windows.get(id);
    if (wasActive) this.viewRequest++;
    if (view) {
      if (!view.webContents.isDestroyed()) view.setVisible(false);
      if (this.host().contentView.children.includes(view)) this.host().contentView.removeChildView(view);
    }
    if (view && !view.webContents.isDestroyed()) view.webContents.close();
    this.windows.delete(id);
    this.tabs.delete(id);
    this.dismissedLogins.delete(id);
    if (this.viewed.get(tab.activityId) === id) this.viewed.delete(tab.activityId);
    if (this.defaults.get(tab.activityId) === id) {
      const next = this.owned(tab.activityId)[0];
      if (next) this.defaults.set(tab.activityId, next.id);
      else this.defaults.delete(tab.activityId);
    }
    const next =
      this.owned(tab.activityId).find((t) => this.windows.has(t.id)) ??
      [...this.tabs.values()].find((t) => this.windows.has(t.id));
    if (wasActive) {
      if (next) this.show(next.id);
      else this.hide();
    }
    this.persist(tab.activityId);
  }
  prepare(activityId: string, args: Record<string, unknown>) {
    // Freeze implicit targets before the approval wait. Closing a tab must never
    // redirect an already approved action to the remaining page.
    const id =
      typeof args.tab_id === 'string' && args.tab_id ? args.tab_id : this.defaults.get(activityId);
    if (args.action === 'new_tab' || args.action === 'list_tabs') return { ...args };
    if (!id && args.action === 'open') return { ...args, action: 'new_tab' };
    return { ...args, ...(id ? { tab_id: id } : {}) };
  }
  async execute(activityId: string, args: Record<string, unknown>, signal: AbortSignal, approvedOrigins?: string[]) {
    signal.throwIfAborted();
    if (this.importing.has(activityId)) throw new Error('Wait for the login transfer to finish.');
    if (
      ![
        'open',
        'new_tab',
        'list_tabs',
        'close_tab',
        'read',
        'click',
        'fill',
        'clear_cookies',
      ].includes(String(args.action))
    )
      throw new Error('Unsupported browser action.');
    if (args.action === 'list_tabs')
      return {
        tabs: this.owned(activityId).map((tab) => ({
          tab_id: tab.id,
          title: tab.title,
          url: tab.url,
        })),
      };
    if (args.tab_id !== undefined && typeof args.tab_id !== 'string')
      throw new Error('Invalid browser tab.');
    const explicitId = args.tab_id as string | undefined;
    let tab = this.tabs.get(explicitId || this.defaults.get(activityId) || '');
    if (explicitId && (!tab || tab.activityId !== activityId))
      throw new Error('This tab does not belong to this activity.');
    if (args.action === 'new_tab' || (!tab && args.action === 'open'))
      tab = this.create(activityId, browserURL(args.url));
    if (!tab) throw new Error('Open a page before using the browser.');
    if (args.action === 'close_tab') {
      this.closeTab(tab.id);
      return { message: 'Browser tab closed.' };
    }
    if (this.reopening.has(tab.id)) await this.reopening.get(tab.id);
    signal.throwIfAborted();
    if (this.busy.has(tab.id)) throw new Error('This browser tab is already working.');
    if (!['open', 'new_tab'].includes(String(args.action)) && !this.windows.has(tab.id))
      throw new Error('Reopen this tab or open a page before using it.');
    const id = tab.id;
    this.defaults.set(activityId, id);
    this.persist(activityId);
    const window = this.get(id);
    const scope = approvedOrigins ? { origins: approvedOrigins, blocked: undefined as string | undefined } : undefined;
    if (scope) this.planOrigins.set(window.webContents.id, scope);
    this.busy.add(id);
    if (!this.active && this.belongsToSelection(activityId)) this.show(id);
    this.notify();
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
      if (args.action === 'open' || args.action === 'new_tab')
        await window.webContents.loadURL(browserURL(args.url));
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
      const result = await window.webContents.executeJavaScriptInIsolatedWorld(999, [
        { code: readPage },
      ]);
      return { ...result, tab_id: id };
    } catch (error) {
      if (scope?.blocked) throw new Error(`This page redirected outside the approved plan to ${scope.blocked}. Request permission to open that address.`);
      throw error;
    } finally {
      if (!window.webContents.isDestroyed()) this.planOrigins.delete(window.webContents.id);
      signal.removeEventListener('abort', abort);
      this.busy.delete(id);
      this.notify();
    }
  }
  show(id: string) {
    if (!this.selectedId) { this.hide(); return; }
    const view = this.windows.get(id);
    if (!view || view.webContents.isDestroyed())
      throw new Error('This activity has no open browser.');
    const host = this.host();
    if (this.active !== view) this.loginOffer.close();
    // Swap native surfaces without publishing a closed pane. Calling hide() here
    // unmounts the renderer pane and races its resize/visibility cleanup against
    // the new tab. Reattach even the current tab to repair native stacking order.
    for (const owned of this.windows.values()) {
      if (!owned.webContents.isDestroyed()) owned.setVisible(false);
      if (host.contentView.children.includes(owned)) host.contentView.removeChildView(owned);
    }
    this.active = view;
    this.activeId = id;
    host.contentView.addChildView(view);
    this.resize();
    view.setVisible(!this.transferOverlay);
    host.removeListener('resize', this.resize);
    host.removeListener('move', this.positionLogin);
    host.on('resize', this.resize);
    host.on('move', this.positionLogin);
    this.notify();
  }
  select(id?: string) {
    this.viewRequest++;
    this.selectedId = id;
    const preferred = id && (this.viewed.get(id) ?? this.defaults.get(id));
    const tab =
      preferred && this.windows.has(preferred)
        ? this.tabs.get(preferred)
        : [...this.tabs.values()].find(
            (t) => this.windows.has(t.id) && this.belongsToSelection(t.activityId),
          );
    if (tab) this.show(tab.id);
    else this.hide();
  }
  hide() {
    this.loginOffer.close();
    if (!this.host().isDestroyed()) this.host().removeListener('move', this.positionLogin);
    this.viewRequest++;
    // Hide every owned native surface, even if active bookkeeping was reset.
    // A hidden renderer tab bar alone cannot conceal an Electron child view.
    for (const view of this.windows.values()) {
      if (!view.webContents.isDestroyed()) view.setVisible(false);
      if (!this.host().isDestroyed() && this.host().contentView.children.includes(view))
        this.host().contentView.removeChildView(view);
    }
    this.active = undefined;
    this.activeId = undefined;
    if (!this.host().isDestroyed()) this.host().removeListener('resize', this.resize);
    this.changed();
  }
  async flush() {
    await Promise.all(
      [...this.windows.values()]
        .filter((view) => !view.webContents.isDestroyed())
        .map(async (view) => {
          view.webContents.session.flushStorageData();
          await view.webContents.session.cookies.flushStore();
        }),
    );
  }
  close() {
    clearInterval(this.loginTimer);
    this.hide();
    for (const view of this.windows.values())
      if (!view.webContents.isDestroyed()) view.webContents.close();
    this.windows.clear();
  }
}
