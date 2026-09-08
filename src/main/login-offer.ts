import { BrowserWindow, type Rectangle } from 'electron';

// This is an app-owned surface above the native website view. Website scripts
// cannot supply its actions or bypass the separate transfer approval screen.
export class LoginOffer {
  private window?: BrowserWindow;
  private key = '';
  show(
    parent: BrowserWindow,
    bounds: Rectangle,
    choose: (action: 'transfer' | 'dismiss') => void,
    key: string,
  ) {
    if (this.window && !this.window.isDestroyed() && this.key === key) return;
    this.close();
    this.key = key;
    const popup = new BrowserWindow({
      parent,
      width: 300,
      height: 130,
      show: false,
      frame: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      backgroundColor: '#fafbf8',
      roundedCorners: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        javascript: false,
      },
    });
    this.window = popup;
    popup.setMenu(null);
    popup.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    popup.webContents.on('will-navigate', (event, url) => {
      event.preventDefault();
      if (url === 'https://dextana.invalid/transfer') choose('transfer');
      if (url === 'https://dextana.invalid/dismiss') choose('dismiss');
    });
    popup.once('ready-to-show', () => {
      if (this.window !== popup || popup.isDestroyed()) return;
      this.position(parent, bounds);
      popup.showInactive();
    });
    void popup
      .loadURL(
        'data:text/html;charset=utf-8,' +
          encodeURIComponent(`<!doctype html>
      <html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Dextana website login</title>
      <style>*{box-sizing:border-box}body{margin:0;padding:16px;font:13px/1.4 system-ui;color:#344e3b;background:#fafbf8;border:1px solid #d9e2d5;height:100vh;border-radius:10px}h1{font-size:14px;margin:0 22px 4px 0;font-weight:650}p{font-size:12px;color:#6b7b66;margin:0 0 12px}a{color:inherit;text-decoration:none}.close{position:absolute;right:12px;top:10px;font-size:20px;color:#7b8875}.action{display:inline-block;background:#426849;color:white;padding:7px 12px;border-radius:6px;font-size:12px}a:focus-visible{outline:2px solid #95ad83;outline-offset:2px}</style></head>
      <body><a class="close" role="button" aria-label="Dismiss login suggestion" href="https://dextana.invalid/dismiss">×</a><h1>Already signed in elsewhere?</h1><p>Bring your browser login into this tab.</p><a class="action" role="button" href="https://dextana.invalid/transfer">Use login from my browser</a></body></html>`),
      )
      .catch(() => {
        if (this.window === popup) this.close();
      });
  }
  position(parent: BrowserWindow, bounds: Rectangle) {
    if (!this.window || this.window.isDestroyed()) return;
    const host = parent.getContentBounds();
    this.window.setBounds({
      x: host.x + bounds.x + 12,
      y: host.y + bounds.y + 12,
      width: Math.min(320, bounds.width - 24),
      height: 130,
    });
  }
  close() {
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = undefined;
  }
}
