import { BrowserWindow } from 'electron';
import {
  agentCursorHeight,
  agentCursorHotspot,
  agentCursorMarkup,
  agentCursorWidth,
} from '../agent-cursor';

export interface ComputerCursor {
  move(element: Record<string, unknown>, action: string): void;
  hide(): void;
  dispose(): void;
}

function targetPoint(element: Record<string, unknown>) {
  const frame = element.frame;
  if (!frame || typeof frame !== 'object' || Array.isArray(frame)) return;
  const { x, y, w, h } = frame as Record<string, unknown>;
  if (![x, y, w, h].every((value) => typeof value === 'number' && Number.isFinite(value))) return;
  return { x: Number(x) + Number(w) / 2, y: Number(y) + Number(h) / 2 };
}

const cursorPage = `<!doctype html><meta charset="utf-8"><style>
  *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}
  body{opacity:1;transform:translateY(0) scale(1);transition:opacity 170ms ease,transform 170ms cubic-bezier(.4,0,.2,1)}
  body.leaving{opacity:0;transform:translateY(-5px) scale(.84)}
  [data-dextana-cursor-mark]{animation:arrive 190ms cubic-bezier(.22,.8,.3,1)}
  @keyframes arrive{from{transform:translateY(2px) scale(.78);opacity:.55}to{transform:translateY(0) scale(1);opacity:1}}
  @media(prefers-reduced-motion:reduce){body{transition:none}[data-dextana-cursor-mark]{animation:none}}
</style>${agentCursorMarkup}`;

/** Click-through overlay that makes Dext's native computer actions visible to the owner. */
export class DextComputerCursor implements ComputerCursor {
  private window?: BrowserWindow;
  private ready = false;
  private visible = false;
  private retiring = new Map<BrowserWindow, ReturnType<typeof setTimeout>>();

  private destroy(window: BrowserWindow) {
    const timer = this.retiring.get(window);
    if (timer) clearTimeout(timer);
    this.retiring.delete(window);
    if (!window.isDestroyed()) window.destroy();
  }

  private view() {
    if (this.window && !this.window.isDestroyed()) return this.window;
    const window = new BrowserWindow({
      width: agentCursorWidth,
      height: agentCursorHeight,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      title: 'Dext computer-use cursor',
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    window.setAlwaysOnTop(true, 'screen-saver');
    window.setIgnoreMouseEvents(true, { forward: true });
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    window.webContents.once('did-finish-load', () => {
      if (this.window !== window) return;
      this.ready = true;
      if (this.visible && !window.isDestroyed()) window.showInactive();
    });
    window.once('closed', () => {
      if (this.window === window) this.window = undefined;
      const timer = this.retiring.get(window);
      if (timer) clearTimeout(timer);
      this.retiring.delete(window);
      this.ready = false;
    });
    void window
      .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(cursorPage)}`)
      .catch(() => undefined);
    this.window = window;
    return window;
  }

  move(element: Record<string, unknown>, _action: string) {
    const point = targetPoint(element);
    if (!point) return;
    const window = this.view();
    const animate = this.visible;
    this.visible = true;
    window.setPosition(
      Math.round(point.x - agentCursorHotspot.x),
      Math.round(point.y - agentCursorHotspot.y),
      animate,
    );
    if (this.ready) window.showInactive();
  }

  hide() {
    this.visible = false;
    const window = this.window;
    this.window = undefined;
    this.ready = false;
    if (!window || window.isDestroyed()) return;
    void window.webContents
      .executeJavaScript("document.body.classList.add('leaving')")
      .catch(() => undefined);
    const timer = setTimeout(() => this.destroy(window), 180);
    timer.unref();
    this.retiring.set(window, timer);
  }

  dispose() {
    this.visible = false;
    const window = this.window;
    this.window = undefined;
    this.ready = false;
    if (window) this.destroy(window);
    for (const retiring of [...this.retiring.keys()]) this.destroy(retiring);
  }
}
