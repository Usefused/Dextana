import { BrowserInspection } from './browser-inspection';
import { browserLayout } from '../shared/browser-layout';
import { browserKey, browserKeys } from './browser-keys';
import { LoginOffer } from './login-offer';
import { hasLoginForm } from './login-detection';
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
// Electron replaces thrown page exceptions with a generic error; return them as data.
async function pageScript(contents: Electron.WebContents, scripts: Electron.WebSource[]) {
  const code = scripts[0].code;
  const result = await contents.executeJavaScriptInIsolatedWorld(999, [{
    code: `(() => { try { return { ok: true, value: ${code} }; } catch (error) { return { ok: false, error: String(error?.message || error).slice(0,500) }; } })()`,
  }]).catch(() => {
    throw new Error('The browser could not run its page inspection. The last action is unverified. Read the page before retrying; this does not establish that the website blocked the action.');
  });
  if (!result?.ok) throw new Error(result?.error || 'Could not inspect this page. Read it again before taking another action.');
  return result.value;
}
const overlaySelector = 'dialog[open],[role="dialog"],[role="alertdialog"],[aria-modal="true"],[popover]:popover-open,[role="menu"],[role="listbox"]';
const controlSelector = 'a,button,input,textarea,select,[role="button"],[role="link"],[contenteditable="true"],[role="textbox"],[role="searchbox"],[role="combobox"],[role="menuitem"],[role="option"]';
const readPage = `(() => {
  const roots = new Map((globalThis.__dextanaShadowRoots || []).filter(root => !root.host.matches('[data-dextana-cursor]')).map(root => [root.host,root]));
  const all = [], seen = new Set();
  const walk = root => {
    for (const e of root.querySelectorAll('*')) {
      if (seen.has(e) || e.closest('[data-dextana-cursor]')) continue;
      seen.add(e); all.push(e);
      const shadow = roots.get(e) || e.shadowRoot;
      if (shadow) { roots.set(e,shadow); walk(shadow); }
    }
  };
  walk(document);
  const visible = e => e.checkVisibility({checkOpacity:true, checkVisibilityCSS:true}) && !!e.getClientRects().length;
  const overlays = all.filter(e => e.matches(${JSON.stringify(overlaySelector)}) && visible(e));
  const inViewport = e => { const r=e.getBoundingClientRect(); return r.bottom>0 && r.right>0 && r.top<innerHeight && r.left<innerWidth; };
  const controls = all.filter(e => e.matches(${JSON.stringify(controlSelector)}) && visible(e));
  // Controls are ordered first for concise initial reads; every other element is
  // retained and can be inspected through the explicit pagination offsets.
  const nodes = [...new Set([...controls.filter(inViewport), ...overlays, ...all.filter(e => visible(e) && inViewport(e)), ...controls, ...all])];
  globalThis.__dextanaElements = nodes;
  globalThis.__dextanaOverlays = overlays;
  globalThis.__dextanaHit = (x,y) => {
    let hit = document.elementFromPoint(x,y);
    const visited = new Set();
    while (hit && !visited.has(hit)) {
      visited.add(hit);
      const next = (roots.get(hit) || hit.shadowRoot)?.elementFromPoint(x,y);
      if (!next || next === hit) break;
      hit = next;
    }
    return hit;
  };
  globalThis.__dextanaContains = (el,node) => {
    while (node) { if (node === el || el.contains(node)) return true; node = node.getRootNode()?.host; }
    return false;
  };
  globalThis.__dextanaFocus = () => {
    let el = document.activeElement;
    while (el) { const next = (roots.get(el) || el.shadowRoot)?.activeElement; if (!next || next === el) break; el = next; }
    return el;
  };
  const label = e => String(e.getAttribute('aria-label') || e.getAttribute('aria-labelledby')?.split(/\\s+/).map(id => e.getRootNode().getElementById?.(id)?.textContent || '').join(' ') || e.innerText || e.labels?.[0]?.innerText || e.getAttribute('title') || e.textContent || e.getAttribute('placeholder') || e.getAttribute('name') || '');
  const active = globalThis.__dextanaFocus();
  const focused = active?.matches('body,html') ? -1 : nodes.indexOf(active);
  const text = [document.body?.innerText || '', ...[...roots.values()].map(root => [...root.children].map(e => e.innerText || e.textContent || '').join('\\n'))].join('\\n');
  return { title: document.title, url: location.href, text, viewport:{width:innerWidth,height:innerHeight}, focused_ref: focused < 0 ? null : String(focused+1), overlays: overlays.map(e => ({ref:String(nodes.indexOf(e)+1), role:e.getAttribute('role') || (e.tagName === 'DIALOG' ? 'dialog' : 'popover'), label:label(e).slice(0,180)})), elements: nodes.map((e,i) => { const r=e.getBoundingClientRect(); return { ref:String(i+1), tag:e.tagName.toLowerCase(), role:e.getAttribute('role') || '', label:label(e).slice(0,180), label_length:label(e).length, type:e.getAttribute('type') || '', visible:visible(e), bounds:{x:r.x,y:r.y,width:r.width,height:r.height}, value:e.type === 'password' ? '[redacted]' : (typeof e.value === 'string' || typeof e.value === 'number' ? String(e.value).slice(0,200) : '') }; }) };
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
  private preferredWidth?: number;
  private draggingPane = false;
  private importing = new Set<string>();
  private windows = new Map<string, WebContentsView>();
  private inspections = new WeakMap<Electron.WebContents, BrowserInspection>();
  private active?: WebContentsView;
  private selectedId?: string;
  private activeId?: string;
  private viewRequest = 0;
  private tabs = new Map<string, BrowserTab>();
  private defaults = new Map<string, string>();
  private viewed = new Map<string, string>();
  private busy = new Set<string>();
  private clipboards = new Map<string, string>();
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
    if (!view || !id || this.checkingLogin || this.transferOverlay || this.draggingPane || view.webContents.isDestroyed()) return;
    const url = view.webContents.getURL();
    if (this.busy.has(id)) { this.loginOffer.close(); return; }
    this.checkingLogin = true;
    try {
      loginOrigin(url);
      const needed = await hasLoginForm(view.webContents);
      if (this.active !== view || this.activeId !== id || view.webContents.getURL() !== url || this.transferOverlay || this.draggingPane || this.busy.has(id)) return;
      if (needed === undefined) return;
      if (!needed) { this.dismissedLogins.delete(id); this.loginOffer.close(); return; }
      if (this.dismissedLogins.get(id) === url) { this.loginOffer.close(); return; }
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
    this.active?.setVisible(!visible && !this.draggingPane);
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
  setPaneWidth(width: unknown, dragging: unknown) {
    if ((width !== undefined && (typeof width !== 'number' || !Number.isFinite(width) || width < 320 || width > 16384)) || typeof dragging !== 'boolean')
      throw new Error('Invalid browser pane size.');
    this.preferredWidth = width as number | undefined;
    this.draggingPane = dragging;
    if (dragging) this.loginOffer.close();
    this.active?.setVisible(!this.transferOverlay && !dragging);
    this.resize();
  }
  private resize = () => {
    const [width, height] = this.host().getContentSize();
    const browserWidth = browserLayout(width, this.preferredWidth).width;
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
        if (!this.transferOverlay) this.dismissedLogins.delete(id);
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
        await pageScript(view.webContents, [{ code: cursor }]);
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
  async refresh(id: string) {
    const view = this.windows.get(id);
    const tab = this.tabs.get(id);
    if (!tab || !view || view.webContents.isDestroyed() || this.activeId !== id)
      throw new Error('Select an open browser tab to refresh.');
    if (this.busy.has(id) || this.importing.has(tab.activityId) || this.transferOverlay)
      throw new Error('Wait for the current browser action to finish before refreshing.');
    this.busy.add(id);
    this.notify();
    const contents = view.webContents;
    try {
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timer);
          contents.removeListener('did-finish-load', loaded);
          contents.removeListener('did-fail-load', failed);
          contents.removeListener('destroyed', closed);
        };
        const loaded = () => { cleanup(); resolve(); };
        const closed = () => { cleanup(); reject(new Error('The browser tab was closed.')); };
        const failed = (_event: unknown, code: number, description: string, _url: string, mainFrame: boolean) => {
          if (!mainFrame || code === -3) return;
          cleanup(); reject(new Error(`Could not refresh this page: ${description}`));
        };
        const timer = setTimeout(() => { cleanup(); reject(new Error('The page took too long to refresh.')); }, 30_000);
        contents.once('did-finish-load', loaded);
        contents.on('did-fail-load', failed);
        contents.once('destroyed', closed);
        try { contents.reload(); } catch (error) { cleanup(); reject(error); }
      });
      await pageScript(contents, [{ code: cursor }]);
      this.remember(id, contents.getURL());
    } finally {
      this.busy.delete(id);
      this.notify();
    }
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
        'press',
        'click_outside',
        'hover',
        'scroll',
        'screenshot',
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
      let inspection = this.inspections.get(window.webContents);
      if (!inspection) { inspection = new BrowserInspection(window.webContents); this.inspections.set(window.webContents, inspection); }
      // A read establishes references in every frame's own isolated context.
      if (['open','new_tab','read'].includes(String(args.action)) && !args.ref)
        return { ...await inspection.snapshot(readPage, args), tab_id: id };
      await inspection.connect();
      const frame = inspection.frame(typeof args.ref === 'string' ? args.ref : undefined, args.action === 'press');
      const run = (scripts: Electron.WebSource[]) => inspection!.run(frame, scripts[0].code);
      if (args.action === 'read' && args.ref) {
        const index = inspection.index(args.ref);
        const detail = await run([{code: `(() => {
          const el=globalThis.__dextanaElements?.[${index}];
          if (!el?.isConnected) throw new Error('Element is stale. Read the page again.');
          return {text:el.innerText || el.textContent || '', value:el.type === 'password' ? '[redacted]' : (el.value ?? ''), attributes:Object.fromEntries([...el.attributes].filter(a => !(el.type === 'password' && a.name === 'value')).map(a => [a.name,a.value]))};
        })()`}]);
        const offset = args.text_offset ?? 0;
        if (typeof offset !== 'number' || !Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid text offset.');
        return { ...detail, text:detail.text.slice(offset,offset+24000), text_total:detail.text.length, next_text_offset:offset+24000<detail.text.length?offset+24000:null, ref:args.ref, tab_id:id };
      }
      if (args.action === 'screenshot') {
        const image = await window.webContents.capturePage();
        return { tab_id:id, image:{type:'image',mediaType:'image/png',data:image.toPNG().toString('base64')}, screenshot_size:image.getSize(), viewport:await run([{code:'({width:innerWidth,height:innerHeight})'}]) };
      }
      await run([{ code: cursor }]);
      const coordinate = (args.action === 'click' || args.action === 'hover') && !args.ref;
      if (coordinate || args.action === 'scroll') {
        const viewport = await run([{code:'({width:innerWidth,height:innerHeight})'}]);
        const x = args.x, y = args.y;
        if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= viewport.width || y >= viewport.height) throw new Error('Choose coordinates inside the browser viewport from the latest screenshot or bounds.');
        const zoom = window.webContents.getZoomFactor();
        const point = {x:Math.round(x*zoom),y:Math.round(y*zoom)};
        await inspection.input({type:'mouseMove',...point});
        if (args.action === 'scroll') {
          const dx = args.delta_x ?? 0, dy = args.delta_y ?? 0;
          if (typeof dx !== 'number' || typeof dy !== 'number' || !Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx)>10000 || Math.abs(dy)>10000) throw new Error('Invalid scroll distance.');
          await inspection.input({type:'mouseWheel',...point,deltaX:dx,deltaY:dy});
        } else if (args.action === 'click') {
          const count = args.click_count ?? 1;
          if (count !== 1 && count !== 2) throw new Error('Click count must be 1 or 2.');
          for (let n=1;n<=count;n++) {
            await inspection.input({type:'mouseDown',...point,button:'left',clickCount:n});
            await inspection.input({type:'mouseUp',...point,button:'left',clickCount:n});
          }
        }
        await delay(150,undefined,{signal});
      }
      if (!coordinate && (args.action === 'click' || args.action === 'fill' || args.action === 'hover')) {
        if (typeof args.ref !== 'string' || !/^(?:f\d+:)?[1-9]\d*$/.test(args.ref))
          throw new Error('Use an element reference from the last browser read.');
        if (args.action === 'fill' && (typeof args.text !== 'string' || args.text.length > 16000))
          throw new Error('Invalid form value.');
        const action = JSON.stringify({
          action: args.action,
          index: inspection.index(args.ref),
          text: args.text ?? '',
        });
        await run( [
          {
            code: `(() => { const a=${action}; const el=globalThis.__dextanaElements?.[a.index]; if(!el || !el.isConnected) throw new Error('Element is stale. Read the page again.'); el.scrollIntoView({block:'center',inline:'nearest'}); const r=el.getBoundingClientRect(); const c=globalThis.__dextanaCursor; c.style.left=(r.left + Math.min(r.width/2,80))+'px'; c.style.top=(r.top+r.height/2)+'px'; })()`,
          },
        ]);
        await delay(280, undefined, { signal });
        signal.throwIfAborted();
        const target = await run( [{
          code: `(() => {
            const a = ${action}; const el = globalThis.__dextanaElements?.[a.index];
            if (!el || !el.isConnected) throw new Error('Element is stale. Read the page again.');
            if (el.disabled || el.getAttribute('aria-disabled') === 'true') throw new Error('This control is disabled.');
            const r = el.getBoundingClientRect();
            const left = Math.max(0, r.left), right = Math.min(innerWidth, r.right);
            const top = Math.max(0, r.top), bottom = Math.min(innerHeight, r.bottom);
            const points = [[(left+right)/2, (top+bottom)/2]];
            // A row's center can be a delete/preview button. Prefer exposed row text
            // or whitespace, and never activate an independent nested control.
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(), count = 0; node && count < 30; node = walker.nextNode(), count++) {
              if (!node.textContent.trim()) continue;
              const range = document.createRange(); range.selectNodeContents(node);
              for (const rect of [...range.getClientRects()].slice(0,3)) points.push([(rect.left+rect.right)/2, (rect.top+rect.bottom)/2]);
            }
            for (const fx of [0.2,0.8,0.05,0.95]) for (const fy of [0.5,0.2,0.8]) points.push([left+(right-left)*fx, top+(bottom-top)*fy]);
            const point = points.find(([x,y]) => {
              if (!r.width || !r.height || x < left || x >= right || y < top || y >= bottom) return false;
              const hit = globalThis.__dextanaHit(x,y);
              if (!hit || (hit !== el && !globalThis.__dextanaContains(el,hit))) return false;
              const nested = hit.closest(${JSON.stringify(controlSelector + ',[role="checkbox"],[role="switch"],[onclick]')});
              return !nested || nested === el || !el.contains(nested);
            });
            if (!point) throw new Error('This control has no unobstructed click target. Read the page and dismiss any covering dialog, or choose a more specific element.');
            const [x,y] = point;
            if (a.action === 'fill') {
              if (el.readOnly) throw new Error('This field is read-only.');
              if (!['INPUT','TEXTAREA','SELECT'].includes(el.tagName) && !el.isContentEditable) throw new Error('This element cannot be filled.');
              el.focus();
              if (globalThis.__dextanaFocus() !== el) throw new Error('Could not focus this field. Read the page again.');
              if (el.tagName === 'SELECT') {
                if (![...el.options].some(option => option.value === a.text)) throw new Error('Choose an available option value.');
                Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, a.text);
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                return { selected: true };
              }
              if (el.isContentEditable) {
                const range = document.createRange(); range.selectNodeContents(el);
                const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
              } else { el.select(); }
            }
            return { x, y };
          })()`,
        }]);
        if (args.action === 'click' || args.action === 'hover') {
          const zoom = window.webContents.getZoomFactor();
          const absolute = await inspection.clickPoint(frame, target);
          const point = { x: Math.round(absolute.x * zoom), y: Math.round(absolute.y * zoom) };
          await inspection.input({ type: 'mouseMove', ...point });
          if (args.action === 'click') {
            const count = args.click_count ?? 1;
            if (count !== 1 && count !== 2) throw new Error('Click count must be 1 or 2.');
            for (let n=1;n<=count;n++) {
              await inspection.input({ type: 'mouseDown', ...point, button: 'left', clickCount: n });
              await inspection.input({ type: 'mouseUp', ...point, button: 'left', clickCount: n });
            }
          }
        } else if (!target.selected) {
          await inspection.insertText(frame, String(args.text));
        }
        // Allow event handlers and a rendering frame to update custom controls.
        await delay(150, undefined, { signal });
      }
      if (args.action === 'click_outside') {
        if (typeof args.ref !== 'string' || !/^(?:f\d+:)?[1-9]\d*$/.test(args.ref))
          throw new Error('Choose an overlay reference from the latest browser result.');
        const target = await run( [{ code: `(() => {
          const el = globalThis.__dextanaElements?.[${inspection.index(args.ref)}];
          if (!el || !el.isConnected) throw new Error('Overlay is stale. Read the page again.');
          if (!globalThis.__dextanaOverlays?.includes(el) || !el.matches(${JSON.stringify(overlaySelector)})) throw new Error('Choose an overlay reference from the latest browser result.');
          if (!el.checkVisibility({checkOpacity:true, checkVisibilityCSS:true})) throw new Error('This overlay is no longer visible. Read the page again.');
          const r = el.getBoundingClientRect();
          const cx = Math.max(1,Math.min(innerWidth-2,(r.left+r.right)/2)), cy = Math.max(1,Math.min(innerHeight-2,(r.top+r.bottom)/2));
          const candidates = [[r.left-12,cy],[r.right+12,cy],[cx,r.top-12],[cx,r.bottom+12],[8,8],[innerWidth-8,8],[8,innerHeight-8],[innerWidth-8,innerHeight-8]];
          for (const [x,y] of candidates) {
            if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight || (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)) continue;
            const hit = globalThis.__dextanaHit(x,y);
            const nativeBackdrop = hit === el && el.matches('dialog:modal');
            if (!hit || (!nativeBackdrop && el.contains(hit))) continue;
            if (!nativeBackdrop && hit.closest('a,button,input,textarea,select,label,[role="button"],[role="link"],[role="menuitem"],[role="option"],[contenteditable="true"],[tabindex]')) continue;
            const other = hit.closest(${JSON.stringify(overlaySelector)});
            if (other && other !== el && !other.contains(el)) continue;
            const cursor = globalThis.__dextanaCursor;
            cursor.style.left = x+'px'; cursor.style.top = y+'px';
            return {x,y};
          }
          throw new Error('No unobstructed non-interactive area outside this overlay is visible. Use Escape or an observed close button.');
        })()` }]);
        signal.throwIfAborted();
        const zoom = window.webContents.getZoomFactor();
        const absolute = await inspection.clickPoint(frame, target);
          const point = { x: Math.round(absolute.x * zoom), y: Math.round(absolute.y * zoom) };
        await inspection.input({ type: 'mouseMove', ...point });
        await inspection.input({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
        await inspection.input({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 });
        await delay(150, undefined, { signal });
      }
      if (args.action === 'press') {
        const key = browserKey(args.key);
        const hasRef = args.ref !== undefined && args.ref !== '';
        if (hasRef && (typeof args.ref !== 'string' || !/^(?:f\d+:)?[1-9]\d*$/.test(args.ref)))
          throw new Error('Use an element reference from the last browser read, or omit ref to press a key at the current focus.');
        const input = JSON.stringify({ index: hasRef ? inspection.index(args.ref) : null, key });
        const selected = await run( [{ code: `(() => {
          const { index, key } = ${input};
          if (!globalThis.__dextanaElements) throw new Error('Read this page before sending keyboard actions.');
          const el = index === null ? globalThis.__dextanaFocus() : globalThis.__dextanaElements[index];
          if (!el || !el.isConnected) throw new Error('Element is stale. Read the page again.');
          if (el.disabled || el.getAttribute('aria-disabled') === 'true') throw new Error('This control is disabled.');
          if (['Paste','Backspace','Delete'].includes(key) && el.readOnly) throw new Error('This field is read-only.');
          if (index !== null) {
            el.scrollIntoView({ block: 'center', inline: 'nearest' });
            const r = el.getBoundingClientRect();
            const hit = globalThis.__dextanaHit(Math.max(0,r.left)+(Math.min(innerWidth,r.right)-Math.max(0,r.left))/2, Math.max(0,r.top)+(Math.min(innerHeight,r.bottom)-Math.max(0,r.top))/2);
            if (!r.width || !r.height || !hit || (hit !== el && !globalThis.__dextanaContains(el,hit))) throw new Error('This control is obscured. Press Escape without a ref or dismiss the covering overlay first.');
            el.focus();
            if (globalThis.__dextanaFocus() !== el) throw new Error('Could not focus this control.');
          }
          if (key === 'SelectAll') {
            if (['INPUT','TEXTAREA'].includes(el.tagName)) el.select();
            else if (el.isContentEditable) { const range = document.createRange(); range.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(range); }
            else throw new Error('SelectAll requires an editable field.');
          }
          if (key === 'Copy') {
            if (el.type === 'password') throw new Error('Password fields cannot be copied.');
            const text = ['INPUT','TEXTAREA'].includes(el.tagName)
              ? el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0)
              : (el.isContentEditable ? getSelection().toString() : '');
            if (text.length > 16000) throw new Error('Copy up to 16,000 characters at a time.');
            return text;
          }
          if (key === 'Paste' && !['INPUT','TEXTAREA'].includes(el.tagName) && !el.isContentEditable) throw new Error('Paste requires an editable field.');
          return null;
        })()` }]);
        signal.throwIfAborted();
        if (key === 'Copy') this.clipboards.set(activityId, selected);
        else if (key === 'Paste') {
          const text = this.clipboards.get(activityId);
          if (text === undefined) throw new Error('Copy text in this activity first. The system clipboard is not used.');
          await inspection.insertText(frame, text);
        } else if (key !== 'SelectAll') {
          const modifiers: Electron.InputEvent['modifiers'] = key === 'Shift+Tab' ? ['shift'] : [];
          await inspection.input({ type: 'keyDown', keyCode: browserKeys[key], modifiers });
          // Enter's character event performs native form submission as well as key handlers.
          if (key === 'Enter') await inspection.input({ type: 'char', keyCode: '\r' });
          if (key === 'Space') await inspection.input({ type: 'char', keyCode: ' ' });
          await inspection.input({ type: 'keyUp', keyCode: browserKeys[key], modifiers });
        }
        await delay(150, undefined, { signal });
      }
      signal.throwIfAborted();
      return { ...await inspection.snapshot(readPage, {}), tab_id: id };
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
    view.setVisible(!this.transferOverlay && !this.draggingPane);
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
    this.clipboards.clear();
    clearInterval(this.loginTimer);
    this.hide();
    for (const view of this.windows.values())
      if (!view.webContents.isDestroyed()) view.webContents.close();
    this.windows.clear();
  }
}
