import { readFile, stat } from 'node:fs/promises';
import { CronJobs } from './cron';
import { loadImage } from './images';
import { prepareBrowserExtension } from './browser-extension';
import { installApplicationMenu } from './application-menu';
import { LoginTransfer } from './session-transfer';
import { Folders } from './folders';
import { externalURL } from '../shared/links';
import { app, BrowserWindow, ipcMain, dialog, shell, clipboard, nativeTheme } from 'electron';
import { join } from 'node:path';
import { Store } from './store';
import { modelReasoning } from './settings';
import { ModelConnections } from './model-connections';
import { Runtime } from './runtime';
import { Activities } from './activities';
import { Browsers, browserURL } from './browser';
import { FusedCLI } from './fused-cli';
import { FusedCLIInstall } from './fused-cli-install';
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
    nativeTheme.themeSource = store.state.theme ?? 'system';
    const backgroundColor = () => nativeTheme.shouldUseDarkColors ? '#171b18' : '#faf9f6';
    nativeTheme.on('updated', () => {
      if (window && !window.isDestroyed()) window.setBackgroundColor(backgroundColor());
    });
    const modelConnections = new ModelConnections(app.getPath('userData'), () => store.state.settings);
    if (store.state.settings.models.length && store.state.settings.provider !== 'openai') {
      try {
        store.state.settings.models = await modelConnections.models(store.state.settings);
        await store.save();
      } catch { /* Keep offline settings; refresh when Ollama becomes available. */ }
    }
    const runtime = new Runtime(app.isPackaged ? join(process.resourcesPath, 'backend') : join(app.getAppPath(), '.build/backend'), app.getPath('userData'));
    runtime.onReady = () => modelConnections.sync(runtime);
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
    const fusedCLIInstall = new FusedCLIInstall(app.getPath('userData'));
    const fusedCLI = new FusedCLI(store, app.getPath('userData'), publish, () => fusedCLIInstall.resolve());
    await fusedCLI.initialize();
    const fused = new Fused(store, app.getPath('userData'), runtime);
    const mcp = new MCPConnections(store, app.getPath('userData'), publish, fusedCLI, runtime);
    const files = new WorkFiles(join(process.env.DEXTANA_USER_DATA ? app.getPath('userData') : app.getPath('documents'), process.env.DEXTANA_USER_DATA ? 'artifacts' : 'Dextana'));
    const activities = new Activities(store, runtime, publish, browsers, fused, mcp, files);
    await activities.initialize();
    const cron = new CronJobs(store, publish, runtime);
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
      void Promise.allSettled([fusedCLIInstall.stop(), schedulerStopped, fusedCLI.stop().then(() => mcp.close()), browsers.flush(), store.flush()]).finally(() => {
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
      const result = await dialog.showOpenDialog(window, { title: 'Add files to context', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Documents, spreadsheets and images', extensions: documentExtensions }, { name: 'Documents', extensions: ['docx', 'pdf', 'txt', 'md'] }, { name: 'Spreadsheets', extensions: ['xlsx', 'csv'] }, { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }] });
      if (result.canceled) return [];
      if (result.filePaths.length > 20) throw new Error('Attach up to 20 documents at a time.');
      return result.filePaths;
    });
    handle('files:reveal', (activityId, itemId) => {
      const item = store.state.activities.find(a => a.id === activityId)?.context?.find(item => item.id === itemId && item.kind === 'file');
      if (!item) throw new Error('This file is not in the chat context.');
      shell.showItemInFolder(item.location);
    });
    handle('image:load', loadImage);
    handle('clipboard:write', (text) => {
      if (typeof text !== 'string' || text.length > 1_000_000) throw new Error('Invalid clipboard text.');
      clipboard.writeText(text);
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
    const settingsRequest = async (path: string, method = 'GET', data?: unknown) => {
      await runtime.ensure();
      const response = await runtime.request('/dextana/activity' + path, { method, body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(10_000) });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Could not update settings.');
      return body;
    };
    handle('skills:list', () => settingsRequest('/skills'));
    handle('skills:save', input => settingsRequest('/skills', 'POST', input));
    handle('skills:delete', id => {
      if (typeof id !== 'string') throw new Error('Choose a skill.');
      return settingsRequest('/skills/' + encodeURIComponent(id), 'DELETE');
    });
    handle('skills:import', async () => {
      const result = await dialog.showOpenDialog(window, { title: 'Import a skill', properties: ['openFile'], filters: [{ name: 'Skill document', extensions: ['md'] }] });
      if (result.canceled || !result.filePaths[0]) return null;
      const path = result.filePaths[0];
      if ((await stat(path)).size > 65536) throw new Error('Choose a SKILL.md file up to 64 KB.');
      return settingsRequest('/skills/import', 'POST', { markdown: await readFile(path, 'utf8') });
    });
    handle('usage', period => {
      if (!['7d', '30d', 'all'].includes(period)) throw new Error('Choose a usage period.');
      return settingsRequest('/usage?period=' + period);
    });
    handle('models', (value, key) => modelConnections.models(value, key));
    handle('model:reasoning', (url, model) => store.state.settings.provider === 'openai' ? 'none' : modelReasoning(url, model));
    handle('activity:model', (id, model, reasoning) => activities.selectModel(id, model, reasoning));
    handle('activity:start', async (input) => {
      return activities.start(input);
    });
    handle('activity:select', (id) => {
      if (id !== undefined && !store.state.activities.some((a) => a.id === id))
        throw new Error('Activity not found.');
      browsers.select(id);
    });
    handle('activity:archive', (id, archived) => activities.archive(id, archived));
    handle('activity:resume', id => activities.resume(id));
    handle('activity:cancel', (id) => activities.cancel(id));
    handle('activity:steer', (activityId, messageId) => activities.steer(activityId, messageId));
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
      const transfer = await loginTransfer.begin(target.origin, destination, async material => {
        await browsers.importLogin(target, material);
        browsers.setTransferOverlay(false);
      });
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
    handle('browser:resize', (width, dragging) => browsers.setPaneWidth(width, dragging));
    handle('browser:new', (id, url) => {
      if (typeof id !== 'string' || !store.state.activities.some(activity => activity.id === id)) throw new Error('Chat not found.');
      return browsers.newTab(id, browserURL(url));
    });
    handle('browser:refresh', id => {
      if (typeof id !== 'string') throw new Error('Invalid browser tab.');
      return browsers.refresh(id);
    });
    handle('browser:close', id => {
      if (typeof id !== 'string') throw new Error('Invalid browser tab.');
      return browsers.closeTab(id);
    });
    handle('fused:cli:status', () => fusedCLIInstall.status());
    handle('fused:cli:check', () => fusedCLIInstall.check());
    handle('fused:cli:install', () => fusedCLIInstall.install());
    handle('fused:cli:cancel', () => fusedCLIInstall.cancel());
    handle('fused:cli:existing', () => fusedCLIInstall.useExisting());
    handle('fused:cli:choose', async () => {
      const selected = await dialog.showOpenDialog(window, { title: 'Locate Fused CLI', properties: ['openFile', 'showHiddenFiles'] });
      return selected.canceled || !selected.filePaths[0] ? fusedCLIInstall.status() : fusedCLIInstall.useFile(selected.filePaths[0]);
    });
    handle('fused:cli:managed', () => fusedCLIInstall.useManaged());
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
    handle('settings:save', async (value, key) => {
      const settings = await modelConnections.save(value, key);
      await modelConnections.sync(runtime);
      store.state.settings = settings;
      await store.save();
      await activities.syncSettings();
    });
    handle('appearance:theme', async value => {
      if (!['system', 'light', 'dark'].includes(value)) throw new Error('Choose System, Light, or Dark.');
      const previous = store.state.theme;
      store.state.theme = value;
      try { await store.save(); }
      catch (error) { store.state.theme = previous; throw error; }
      nativeTheme.themeSource = value;
      publish();
    });
    const createWindow = () => {
      window = new BrowserWindow({
        width: 1320,
        height: 880,
        minWidth: 940,
        minHeight: 640,
        title: 'Dextana',
        icon: appIcon,
        backgroundColor: backgroundColor(),
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
