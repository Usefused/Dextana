import { Folders } from './folders';
import { externalURL } from '../shared/links';
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { join } from 'node:path';
import { Store } from './store';
import { getModels, settingsFrom } from './settings';
import { Runtime } from './runtime';
import { Activities } from './activities';
import { Browsers, browserURL } from './browser';
import { Fused } from './fused';
import { documentExtensions } from './files';
import { WorkFiles } from './files';
import { MCPConnections } from './mcp';

if (process.env.DEXTANA_USER_DATA) app.setPath('userData', process.env.DEXTANA_USER_DATA);
let window: BrowserWindow;
app
  .whenReady()
  .then(async () => {
    const store = new Store(app.getPath('userData'));
    await store.load();
    const runtime = new Runtime();
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
        get: id => store.state.activities.find(activity => activity.id === id)?.browser?.url,
        remember: (id, value, needsReopen = false) => {
          const activity = store.state.activities.find(activity => activity.id === id);
          if (!activity) return;
          const url = browserURL(value);
          if (activity.browser?.url === url && activity.browser.needsReopen === needsReopen) return;
          activity.browser = { url, needsReopen };
          publish();
          void store.save().catch(() => {
            if (activity.browser) activity.browser.saveError = 'This page could not be saved for next time.';
            publish();
          });
        },
      },
    );
    const fused = new Fused(store, app.getPath('userData'));
    const mcp = new MCPConnections(store, app.getPath('userData'), publish);
    const files = new WorkFiles(join(process.env.DEXTANA_USER_DATA ? app.getPath('userData') : app.getPath('documents'), process.env.DEXTANA_USER_DATA ? 'artifacts' : 'Dextana'));
    const activities = new Activities(store, runtime, publish, browsers, fused, mcp, files);
    let quitting = false;
    app.on('before-quit', event => {
      if (quitting) return;
      event.preventDefault();
      quitting = true;
      activities.stopAll();
      void fused.close();
      void mcp.close();
      runtime.stop();
      void Promise.allSettled([browsers.flush(), store.flush()]).finally(() => {
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
      const id = await activities.start(input);
      browsers.select(id);
      return id;
    });
    handle('activity:select', (id) => {
      if (id !== undefined && !store.state.activities.some((a) => a.id === id))
        throw new Error('Activity not found.');
      browsers.select(id);
    });
    handle('activity:archive', (id, archived) => activities.archive(id, archived));
    handle('activity:cancel', (id) => activities.cancel(id));
    handle('browser:show', (id) => {
      if (typeof id !== 'string' || !store.state.activities.some(activity => activity.id === id)) throw new Error('Chat not found.');
      return browsers.reopen(id);
    });
    handle('browser:hide', () => browsers.hide());
    handle('fused:account:save', async input => { await fused.saveAccount(input); publish(); });
    handle('fused:account:remove', async () => { await fused.removeAccount(); publish(); });
    handle('fused:remove', async id => { await fused.remove(id); publish(); });
    handle('fused:save', async (input) => {
      const id = await fused.save(input);
      publish();
      return id;
    });
    handle('activity:approve', (input) => activities.approve(input));
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
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', (event) => event.preventDefault());
      window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
        callback(false),
      );
      void window.loadFile(join(__dirname, 'renderer/index.html'));
    };
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  })
  .catch((error) => {
    dialog.showErrorBox('Dextana could not start', error.message);
    app.quit();
  });
app.on('window-all-closed', () => app.quit());
