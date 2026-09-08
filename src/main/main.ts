import { CronJobs } from './cron';
import { prepareBrowserExtension } from './browser-extension';
import { installApplicationMenu } from './application-menu';
import { LoginTransfer } from './session-transfer';
import { Folders } from './folders';
import { externalURL } from '../shared/links';
import { app, BrowserWindow, ipcMain, dialog, shell, clipboard } from 'electron';
import { join } from 'node:path';
import { Store } from './store';
import { getModels, settingsFrom } from './settings';
import { Runtime } from './runtime';
import { Activities } from './activities';
import { Browsers, browserURL } from './browser';
import { FusedCLI } from './fused-cli';
import { Fused } from './fused';
import { documentExtensions } from './files';
import { WorkFiles } from './files';
import { MCPConnections } from './mcp';

const existingUserData = join(app.getPath('appData'), 'dextana');
app.setName('Dextana');
if (process.platform === 'win32') app.setAppUserModelId('com.dextana.desktop');
app.setPath('userData', existingUserData);
if (process.env.DEXTANA_USER_DATA) app.setPath('userData', process.env.DEXTANA_USER_DATA);
let window: BrowserWindow;
app
  .whenReady()
  .then(async () => {
    const store = new Store(app.getPath('userData'));
    await store.load();
    const runtime = new Runtime(app.isPackaged ? join(process.resourcesPath, 'backend') : join(app.getAppPath(), '.build/backend'), app.getPath('userData'));
    const appIcon = join(app.getAppPath(), 'assets/icon.png');
    if (process.platform === 'darwin') app.dock?.setIcon(appIcon);
    const publish = () => {
      if (window && !window.isDestroyed()) window.webContents.send('state', store.state);
    };
    const browsers = new Browsers(
      () => window,
      (browser) => {
        store.state.browser = browser;
        publish();
      },
      {
        list: () => store.state.activities.flatMap(activity => activity.browser?.tabs ?? []),
        defaultTab: id => store.state.activities.find(activity => activity.id === id)?.browser?.activeTabId,
        parent: id => store.state.activities.find(activity => activity.id === id)?.parentId,
        save: (id, tabs, activeTabId) => {
          const activity = store.state.activities.find(activity => activity.id === id);
          if (!activity) return;
          activity.browserTabsInitialized = true;
          const current = tabs.find(tab => tab.id === activeTabId) ?? tabs[0];
          if (current) activity.browser = { url: current.url, needsReopen: current.needsReopen, tabs, activeTabId: current.id };
          else delete activity.browser;
          publish();
          void store.save().catch(() => {
            if (activity.browser) activity.browser.saveError = 'These tabs could not be saved for next time.';
            publish();
          });
        },
      },
      tabId => window.webContents.send('browser:login:offer', tabId),
    );
    const fusedCLI = new FusedCLI(store, app.getPath('userData'), publish);
    await fusedCLI.initialize();
    const fused = new Fused(store, app.getPath('userData'));
    const mcp = new MCPConnections(store, app.getPath('userData'), publish, fusedCLI);
    const files = new WorkFiles(join(process.env.DEXTANA_USER_DATA ? app.getPath('userData') : app.getPath('documents'), process.env.DEXTANA_USER_DATA ? 'artifacts' : 'Dextana'));
    const activities = new Activities(store, runtime, publish, browsers, fused, mcp, files);
    const cron = new CronJobs(store, activities, publish, runtime);
    void cron.initialize();
    const loginTransfer = new LoginTransfer();
    let quitting = false;
    app.on('before-quit', event => {
      if (quitting) return;
      event.preventDefault();
      quitting = true;
      fusedCLI.cancel();
      loginTransfer.close();
      const schedulerStopped = cron.stop();
      activities.stopAll();
      void fused.close();
      runtime.stop();
      void Promise.allSettled([schedulerStopped, fusedCLI.stop().then(() => mcp.close()), browsers.flush(), store.flush()]).finally(() => {
        browsers.close();
        app.quit();
      });
    });
    function handle(channel: string, handler: (...args: any[]) => unknown) {
      ipcMain.handle(channel, (event, ...args) => {
        if (
          event.sender !== window.webContents ||
          event.senderFrame !== window.webContents.mainFrame
        )
          throw new Error('Untrusted caller');
        return handler(...args);
      });
    }
    handle('cron:save', (input, id) => cron.save(input, id));
    handle('cron:remove', id => cron.remove(id));
    handle('cron:run', id => cron.runNow(id));
    handle('files:attach', (id, paths) => activities.attachContext(id, paths));
    handle('files:pick', async () => {
      const result = await dialog.showOpenDialog(window, { title: 'Add work documents', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Work documents', extensions: documentExtensions }] });
      if (result.canceled) return [];
      if (result.filePaths.length > 20) throw new Error('Attach up to 20 documents at a time.');
      return result.filePaths;
    });
    handle('files:reveal', (activityId, itemId) => {
      const item = store.state.activities.find(a => a.id === activityId)?.context?.find(item => item.id === itemId && item.kind === 'file');
      if (!item) throw new Error('This file is not in the chat context.');
      shell.showItemInFolder(item.location);
    });
    handle('link:open', async (value) => {
      const url = externalURL(value);
      if (!url) throw new Error('Only HTTP and HTTPS links can be opened.');
      await shell.openExternal(url);
    });
    const folders = new Folders(store, publish);
    handle('folder:create', name => folders.create(name));
    handle('folder:update', (id, changes) => folders.update(id, changes));
    handle('folder:delete', id => folders.remove(id));
    handle('activity:move', (id, folderId) => folders.move(id, folderId));
    handle('snapshot', () => store.state);
    handle('mcp:save', input => mcp.save(input));
    handle('mcp:test', id => mcp.test(id));
    handle('mcp:tools', (id, policies) => mcp.setTools(id, policies));
    handle('mcp:remove', id => mcp.remove(id));
    handle('models', getModels);
    handle('activity:start', async (input) => {
      return activities.start(input);
    });
    handle('activity:select', (id) => {
      if (id !== undefined && !store.state.activities.some((a) => a.id === id))
        throw new Error('Activity not found.');
      browsers.select(id);
    });
    handle('activity:archive', (id, archived) => activities.archive(id, archived));
    handle('activity:cancel', (id) => activities.cancel(id));
    handle('activity:plan', input => activities.decidePlan(input));
    handle('browser:show', (id, tabId) => {
      if (typeof id !== 'string' || !store.state.activities.some(activity => activity.id === id)) throw new Error('Chat not found.');
      if (tabId !== undefined && typeof tabId !== 'string') throw new Error('Invalid browser tab.');
      return browsers.reopen(id, tabId);
    });
    handle('browser:login:begin', async id => {
      if (typeof id !== 'string') throw new Error('Invalid browser tab.');
      const target = browsers.loginTarget(id);
      const destination = store.state.activities.find(a => a.id === target.activityId)?.title ?? 'Dextana';
      const transfer = await loginTransfer.begin(target.origin, destination, material => browsers.importLogin(target, material));
      browsers.setTransferOverlay(true);
      return transfer;
    });
    handle('browser:login:copy', id => clipboard.writeText(loginTransfer.connectionCode(id)));
    handle('browser:login:extension', async id => {
      loginTransfer.status(id);
      try {
        const folder = await prepareBrowserExtension({ packaged: app.isPackaged, appPath: app.getAppPath(), resourcesPath: process.resourcesPath, userData: app.getPath('userData') });
        const error = await shell.openPath(folder);
        if (error) throw new Error(error);
      } catch { throw new Error('Could not open the bundled extension. Please reinstall or rebuild Dextana.'); }
    });
    handle('browser:login:status', id => loginTransfer.status(id));
    handle('browser:login:cancel', id => { if (loginTransfer.cancel(id)) browsers.setTransferOverlay(false); });
    handle('browser:hide', () => browsers.hide());
    handle('browser:new', (id, url) => {
      if (typeof id !== 'string' || !store.state.activities.some(activity => activity.id === id)) throw new Error('Chat not found.');
      return browsers.newTab(id, browserURL(url));
    });
    handle('browser:close', id => {
      if (typeof id !== 'string') throw new Error('Invalid browser tab.');
      return browsers.closeTab(id);
    });
    handle('fused:login', url => fusedCLI.login(url));
    handle('fused:login:cancel', () => fusedCLI.cancel());
    handle('fused:discover', () => fusedCLI.discover());
    handle('fused:logout', async () => { await mcp.revokeFused(); await fusedCLI.logout(); });
    handle('fused:select', (id, autoToken, operations) => mcp.selectFused(id, autoToken, operations));
    handle('fused:account:save', async input => { await fused.saveAccount(input); publish(); });
    handle('fused:account:remove', async () => { await fused.removeAccount(); publish(); });
    handle('fused:remove', async id => { await fused.remove(id); publish(); });
    handle('fused:save', async (input) => {
      const id = await fused.save(input);
      publish();
      return id;
    });
    handle('activity:approve', (input) => activities.approve(input));
    handle('activity:session-approvals', (id, allowAll) => activities.setSessionApprovals(id, allowAll));
    handle('activity:permission', (input) => activities.setPermission(input));
    handle('settings:save', async (value) => {
      store.state.settings = settingsFrom(value);
      await store.save();
    });
    const createWindow = () => {
      window = new BrowserWindow({
        width: 1320,
        height: 880,
        minWidth: 940,
        minHeight: 640,
        title: 'Dextana',
        icon: appIcon,
        backgroundColor: '#faf9f6',
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 22, y: 22 },
        webPreferences: {
          preload: join(__dirname, 'preload.cjs'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      // A fresh app view starts without a selected chat, including renderer reloads.
      window.webContents.on('did-start-loading', () => browsers.select(undefined));
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', (event) => event.preventDefault());
      window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
        callback(false),
      );
      void window.loadFile(join(__dirname, 'renderer/index.html'));
    };
    createWindow();
    installApplicationMenu(() => {
      if (window.isDestroyed()) return;
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
      window.webContents.send('settings:open');
    });
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  })
  .catch((error) => {
    dialog.showErrorBox('Dextana could not start', error.message);
    app.quit();
  });
app.on('window-all-closed', () => app.quit());
