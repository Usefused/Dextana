import { Notifications } from './notifications';
import { ActivityNotifications } from './activity-notifications';
import { showNativeNotification } from './native-notifications';
import { DextIntegrations } from './integrations';
import { UserBrowser } from './user-browser';
import { extensionId } from './user-browser/protocol';
import extensionManifest from '../../browser-extension/manifest.json';
import { rememberDesktop, findDesktopContext } from './context';
import { syncBrowserContext } from './user-browser/context';
import { selectBrowser } from './user-browser/routing';
import { DesktopComputer } from './desktop/computer';
import { CuaAdapter } from './desktop/cua-adapter';
import { computerProvider } from './desktop/computer-provider';
import type { ComputerCommand } from '../shared/desktop-computer';
import { readFile, stat } from 'node:fs/promises';
import { CronJobs } from './cron';
import { loadImage } from './images';
import { prepareBrowserExtension } from './browser-extension';
import { installApplicationMenu } from './application-menu';
import { LoginTransfer } from './session-transfer';
import { Folders } from './folders';
import { externalURL } from '../shared/links';
import { app, BrowserWindow, ipcMain, dialog, shell, clipboard, nativeTheme, Tray, Menu, nativeImage, powerMonitor } from 'electron';
import { join } from 'node:path';
import { Store } from './store';
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
import { DesktopTimeFiles, openDocument } from './desktop/time-files';
import { DesktopGateway } from './desktop/gateway';
import { timeProvider } from './desktop/time-provider';
import { DesktopWorkflows } from './desktop/workflows';
import { workflowProvider } from './desktop/workflow-provider';
import { DesktopContextRecorder } from './desktop/context-recorder';
import { createWatchRunner } from './desktop/watch-runner';
import type { DesktopTimeFilesRequest } from '../shared/desktop-time-files';
import type { Activity } from '../shared/types';

const existingUserData = join(app.getPath('appData'), 'dextana');
app.setName('Dextana');
if (process.platform === 'win32') app.setAppUserModelId('com.dextana.desktop');
app.setPath('userData', existingUserData);
if (process.env.DEXTANA_USER_DATA) app.setPath('userData', process.env.DEXTANA_USER_DATA);
let window: BrowserWindow;
// npm forwards terminal interrupts to Electron. Route them through the normal
// quit lifecycle so the detached backend releases its workspace database lock.
process.once('SIGINT', () => app.quit());
process.once('SIGTERM', () => app.quit());
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
    // Also cover failures during initialization, before before-quit is installed.
    app.once('will-quit', () => runtime.stop());
    runtime.onReady = () => modelConnections.sync(runtime);
    const appIcon = join(app.getAppPath(), 'assets/icon.png');
    if (process.platform === 'darwin') app.dock?.setIcon(appIcon);
    let activityNotifications: ActivityNotifications | undefined;
    const publish = () => {
      activityNotifications?.update(store.state.activities);
      syncBrowserContext(store.state.activities, store.state.userBrowsers ?? []);
      if (window && !window.isDestroyed()) window.webContents.send('state', store.state);
    };
    store.state.userBrowsers = [];
    const userBrowsers = new UserBrowser(`chrome-extension://${extensionId(extensionManifest.key)}`, states => {
      store.state.userBrowsers = states;
      publish();
    });
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
      userBrowsers,
    );
    const fusedCLIInstall = new FusedCLIInstall(app.getPath('userData'));
    const fusedCLI = new FusedCLI(store, app.getPath('userData'), publish, () => fusedCLIInstall.resolve());
    await fusedCLI.initialize();
    const fused = new Fused(store, app.getPath('userData'), runtime);
    const mcp = new MCPConnections(store, app.getPath('userData'), publish, fusedCLI, runtime);
    const files = new WorkFiles(join(process.env.DEXTANA_USER_DATA ? app.getPath('userData') : app.getPath('documents'), process.env.DEXTANA_USER_DATA ? 'artifacts' : 'Dextana'));
    const showDesktop = (resourceId?: string) => {
      if (!window || window.isDestroyed()) return;
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
      window.webContents.send('desktop:open', resourceId);
      if (resourceId) void notifications.command({ action: 'readTarget', target: { kind: 'desktop', resourceId } }).catch(console.error);
    };
    const showActivity = (activityId: string) => {
      if (!window || window.isDestroyed()) return;
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
      window.webContents.send('activity:open', activityId);
    };
    const desktopFailure = (failure: unknown) => {
      store.state.desktopError = failure instanceof Error ? failure.message : String(failure);
      publish();
      void notifications.send({ source: 'Desktop', title: 'Desktop service needs attention', body: store.state.desktopError, severity: 'error', key: store.state.desktopError, target: { kind: 'desktop' } }).catch(console.error);
    };
    const notifications = new Notifications({
      get: () => store.state.notifications ?? [],
      set: items => { store.state.notifications = items; },
      save: () => store.save(),
      changed: publish,
      isFocused: () => !!window && !window.isDestroyed() && window.isVisible() && window.isFocused() && !window.isMinimized(),
      showNative: showNativeNotification,
      failed: desktopFailure,
      open: async item => {
        const target = item.target;
        if (target?.kind === 'activity') {
          if (!store.state.activities.some(activity => activity.id === target.activityId)) throw new Error('This chat is no longer available.');
          showActivity(target.activityId);
          if (target.path) await openDocument(target.path, path => shell.openPath(path));
        } else if (target?.kind === 'desktop') showDesktop(target.resourceId);
        else if (window && !window.isDestroyed()) {
          if (window.isMinimized()) window.restore();
          window.show(); window.focus(); window.webContents.send('notifications:open');
        }
      },
    });
    const desktopContext = new DesktopContextRecorder(store);
    const timeFiles = new DesktopTimeFiles({
      storePath: join(app.getPath('userData'), 'desktop-alarms.json'),
      resolveFile: (fileId, activityId) => {
        const item = store.state.activities
          .find((a) => a.id === activityId)
          ?.context?.find((item) => item.id === fileId && item.kind === 'file');
        if (!item) throw new Error('This file is not in the chat context.');
        return item.location;
      },
      openPath: (path) => shell.openPath(path),
      notify: async (alarm) => {
        await notifications.send({
          source: alarm.kind === 'timer' ? 'Timers' : 'Reminders',
          page: 'time',
          title: alarm.overdue ? `Overdue: ${alarm.title}` : alarm.title,
          body: alarm.message,
          key: `${alarm.id}:${alarm.dueAt}`,
          target: { kind: 'desktop', resourceId: alarm.id, activityId: alarm.sourceActivityId },
        });
      },
      onChange: (snapshot) => {
        store.state.desktopAlarms = snapshot;
        snapshot.alarms.forEach((alarm) => desktopContext.alarm(alarm));
        publish();
      },
    });
    await timeFiles.initialize();
    timeFiles.start();
    const workflowNotice = async (input: {
      title: string;
      body: string;
      activityId: string;
      path?: string;
      severity?: 'success' | 'error';
    }) => {
      await notifications.send({
        source: 'Workflows', page: 'workflows', title: input.title, body: input.body, severity: input.severity ?? 'success',
        target: { kind: 'activity', activityId: input.activityId, path: input.path },
      });
    };
    let workflowsReady = false;
    const syncWorkflowContext = () => {
      if (!workflowsReady) return;
      desktopContext.workflows(workflows.snapshot());
      publish();
    };
    const workflows = new DesktopWorkflows(app.getPath('userData'), {
      openPath: async (path) => {
        if ((await stat(path)).isDirectory()) {
          const error = await shell.openPath(path);
          if (error) throw new Error(error);
        } else await openDocument(path, (value) => shell.openPath(value));
      },
      openURL: async (url) => {
        const value = externalURL(url);
        if (!value) throw new Error('Use an HTTP or HTTPS address.');
        await shell.openExternal(value);
      },
      notify: workflowNotice,
      onChange: syncWorkflowContext,
      runWatch: createWatchRunner(store, () => activities, desktopFailure),
    });
    const recordWorkflow = (
      operation: string,
      args: Record<string, unknown>,
      result: unknown,
      context: { activityId: string },
    ) => {
      desktopContext.workflow(operation, args, result, context);
      syncWorkflowContext();
    };
    const computer = new DesktopComputer(new CuaAdapter(), snapshot => {
      desktopContext.computer(snapshot);
      publish();
    });
    // Computer authority is ephemeral; never restore a saved selection after restart.
    desktopContext.resetComputer();
    desktopContext.computer(computer.snapshot());
    const desktopGateway = new DesktopGateway([
      computerProvider(computer),
      timeProvider(
        timeFiles,
        (operation, args, _result, context) => {
          if (operation === 'file.open')
            desktopContext.fileOpened(String(args.fileId), context.activityId);
        },
        (fileId, activityId) => {
          const file = store.state.activities
            .find((a) => a.id === activityId)
            ?.context?.find((item) => item.id === fileId && item.kind === 'file');
          if (!file) throw new Error('This file is not in the chat context.');
          return { name: file.name, path: file.location };
        },
      ),
      workflowProvider(workflows, recordWorkflow),
    ]);
    const activities = new Activities(
      store,
      runtime,
      publish,
      browsers,
      fused,
      mcp,
      files,
      desktopGateway,
      (incoming) => {
        for (const activity of incoming)
          for (const message of activity.messages)
            if (message.reminder) {
              void timeFiles
                .ingestReminder({
                  id: message.id,
                  sourceActivityId: activity.id,
                  title: 'Reminder',
                  body: message.content,
                  deliveredAt: message.reminder.deliveredAt,
                  overdue: message.reminder.overdue,
                  notify: Date.now() - Date.parse(message.reminder.deliveredAt) < 60_000,
                })
                .catch(desktopFailure);
            }
        syncWorkflowContext();
      },
    );
    await activities.initialize();
    activityNotifications = new ActivityNotifications(
      store.state.activities,
      id => notifications.isViewing({ target: { kind: 'activity', activityId: id } }),
      notifications.send,
      console.error,
    );
    workflows.setOnBattery(powerMonitor.isOnBatteryPower());
    await workflows.initialize();
    workflowsReady = true;
    syncWorkflowContext();
    const cron = new CronJobs(store, publish, runtime, body => {
      void notifications.send({ source: 'Scheduled jobs', page: 'cron', title: 'Scheduler needs attention', body, severity: 'error' }).catch(console.error);
    });
    void cron.initialize();
    const loginTransfer = new LoginTransfer();
    let quitting = false;
    app.on('before-quit', event => {
      if (quitting) return;
      event.preventDefault();
      quitting = true;
      activityNotifications?.dispose();
      activityNotifications = undefined;
      const computerStopped = computer.dispose();
      const timersStopped = timeFiles.dispose();
      tray?.destroy();
      fusedCLI.cancel();
      loginTransfer.close();
      userBrowsers.close();
      const schedulerStopped = cron.stop();
      const workflowsStopped = workflows.dispose();
      activities.stopAll();
      void fused.close();
      runtime.stop();
      void Promise.allSettled([computerStopped, timersStopped, workflowsStopped, fusedCLIInstall.stop(), schedulerStopped, fusedCLI.stop().then(() => mcp.close()), browsers.flush()]).then(() => notifications.flush()).then(() => Promise.allSettled([store.flush()])).finally(() => {
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
    handle('notifications', command => notifications.command(command));
    handle('desktop:computer', async (request: ComputerCommand) => {
      switch (request.action) {
        case 'enable': return computer.enable();
        case 'permissions': return computer.enable(true);
        case 'windows': return computer.windows();
        case 'stop': computer.stop(); break;
        case 'disable': computer.disable(); break;
        case 'select': {
          if (!store.state.activities.some(activity => activity.id === request.activityId))
            throw new Error('Select an existing chat.');
          return computer.select(request.windowId, request.activityId);
        }
        default: throw new Error('Unsupported computer request.');
      }
      return computer.snapshot();
    });
    handle('desktop:workflow', async (operation, args, activityId) => {
      if (
        ![
          'workflow.watch_remove',
          'workflow.watch_run',
          'workflow.watch_set_enabled',
          'workflow.watch_save',
          'workflow.rename_apply',
          'workflow.rename_undo',
          'workflow.handoff',
          'processing.cancel',
          'device.power_policy',
        ].includes(operation) ||
        !store.state.activities.some((a) => a.id === activityId)
      )
        throw new Error('Choose a desktop workflow action from its originating chat.');
      if (!args || typeof args !== 'object' || Array.isArray(args))
        throw new Error('Invalid desktop workflow arguments.');
      const result = await workflows.execute(operation, args, new AbortController().signal, {
        activityId,
      });
      recordWorkflow(operation, args, result, { activityId });
      await store.save();
      publish();
      return result;
    });
    handle('desktop:alarm', async (request: DesktopTimeFilesRequest) => {
      if (!request || typeof request !== 'object' || request.operation === 'file.open')
        throw new Error('Choose a desktop alarm action.');
      const result = await timeFiles.execute(request);
      await store.save();
      return result;
    });
    handle('desktop:background', async (enabled) => {
      if (typeof enabled !== 'boolean')
        throw new Error('Choose whether Dextana runs in the background.');
      store.state.desktopBackground = enabled;
      await store.save();
      publish();
    });
    handle('desktop:context', async (activityId, itemId) => {
      const item = findDesktopContext(store.state.activities, activityId, itemId);
      if (!item?.desktop) throw new Error('This desktop resource is not in the chat context.');
      if (item.desktop.operation === 'browser.attach') { showActivity(activityId); return; }
      if (item.desktop.work === 'files')
        return timeFiles.execute({
          operation: 'file.open',
          activityId,
          fileId: item.desktop.resourceId,
        });
      if (['workflow.handoff', 'workflow.setup_open'].includes(item.desktop.operation)) {
        const path = item.desktop.resourceId;
        if (item.desktop.operation === 'workflow.setup_open' && (await stat(path)).isDirectory()) {
          const error = await shell.openPath(path);
          if (error) throw new Error(error);
          return;
        }
        return openDocument(path, (value) => shell.openPath(value));
      }
      showDesktop(item.desktop.resourceId);
    });
    handle('files:open', async (activityId, fileId) => {
      const result = await timeFiles.execute({ operation: 'file.open', activityId, fileId });
      desktopContext.fileOpened(fileId, activityId);
      await store.save();
      publish();
      return result;
    });
    handle('cron:save' , (input, id) => cron.save(input, id));
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
    handle('modelCatalog', (value, key, auth) => modelConnections.modelCatalog(value, key, auth));
    handle('model:reasoning', (url, model) => modelConnections.reasoning(url, model));
    handle('activity:model', (id, model, reasoning) => activities.selectModel(id, model, reasoning));
    handle('activity:start', async (input) => {
      return activities.start(input);
    });
    handle('activity:answer-questions', input => activities.answerQuestions(input));
    handle('activity:select', (id) => {
      if (id !== undefined && !store.state.activities.some((a) => a.id === id))
        throw new Error('Activity not found.');
      browsers.select(id);
    });
    handle('activity:archive', (id, archived) => activities.archive(id, archived));
    handle('activity:resume', id => activities.resume(id));
    handle('activity:cancel', (id) => activities.cancel(id));
    handle('activity:steer', (activityId, messageId) => activities.steer(activityId, messageId));
    handle('activity:edit-message', input => activities.editMessage(input));
    handle('activity:update-queued-message', input => activities.updateQueuedMessage(input));
    handle('activity:plan', input => activities.decidePlan(input));
    handle('browser:user:begin', activityId => {
      const activity = store.state.activities.find(candidate => candidate.id === activityId);
      if (!activity) throw new Error('Choose an existing chat.');
      selectBrowser(activity, 'user');
      if (userBrowsers.reuse(activity.id)) return undefined;
      return userBrowsers.begin(activity.id,activity.title);
    });
    handle('browser:user:pairing', activityId => userBrowsers.pairing(activityId));
    handle('browser:user:stop', activityId => userBrowsers.stop(activityId));
    handle('browser:user:reset', activityId => {
      const activity = store.state.activities.find(candidate => candidate.id === activityId);
      if (!activity) throw new Error('Choose an existing chat.');
      selectBrowser(activity, 'in-app');
      userBrowsers.reset(activityId);
    });
    handle('browser:user:extension', async () => {
      const folder = await prepareBrowserExtension({packaged:app.isPackaged,appPath:app.getAppPath(),resourcesPath:process.resourcesPath,userData:app.getPath('userData')});
      const error = await shell.openPath(folder);
      if (error) throw new Error(error);
    });
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
    handle('browser:overlay', visible => { if (typeof visible !== 'boolean') throw new Error('Invalid overlay state'); browsers.setAppOverlay(visible); });
    handle('browser:resize', (width, dragging) => browsers.setPaneWidth(width, dragging));
    handle('browser:new', (id, url) => {
      if (typeof id !== 'string' || !store.state.activities.some(activity => activity.id === id)) throw new Error('Chat not found.');
      return browsers.newTab(id, browserURL(url));
    });
    handle('browser:download', (id, action) => browsers.downloadAction(id, action));
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
    const integrations = new DextIntegrations(app.getPath('userData'), store, fused, publish);
    handle('integrations:command', input => integrations.command(input));
    handle('browser:preferences', (input) => activities.setBrowserPreferences(input));
    handle('activity:permission', (input) => activities.setPermission(input));
    handle('settings:save', async (value, key, auth) => {
      const settings = await modelConnections.save(value, key, runtime, auth);
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
    const tray = createDesktopTray();
    function createDesktopTray() {
      let tray: Tray | undefined;
      try {
        tray = new Tray(nativeImage.createFromPath(appIcon).resize({ width: 18, height: 18 }));
        tray.setToolTip('Dextana');
        tray.setContextMenu(
          Menu.buildFromTemplate([
            { label: 'Stop computer use', click: () => computer.stop() },
            { label: 'Stop browser control', click: () => userBrowsers.close() },
            {
              label: 'Open Dextana',
              click: () => {
                if (window && !window.isDestroyed()) {
                  window.show();
                  window.focus();
                }
              },
            },
            { label: 'Timers and desktop work', click: () => showDesktop() },
            { type: 'separator' },
            { label: 'Quit Dextana', click: () => app.quit() },
          ]),
        );
        tray.on('click', () => showDesktop());
      } catch {
        store.state.desktopBackground = false;
      }
      return tray;
    }
    powerMonitor.on('on-battery', () => workflows.setOnBattery(true));
    powerMonitor.on('on-ac', () => workflows.setOnBattery(false));
    powerMonitor.on('resume', () => { void timeFiles.tick().catch(desktopFailure); });
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
      window.on('close', event => {
        if (!quitting && tray && store.state.desktopBackground !== false) { event.preventDefault(); window.hide(); }
      });
      window.on('focus', () => { void notifications.refreshVisibility().catch(console.error); });
      // A fresh app view starts without a selected chat, including renderer reloads.
      window.webContents.on('did-start-loading', () => {
        browsers.select(undefined);
        void notifications.command({ action: 'view' }).catch(console.error);
      });
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
      else { window.show(); window.focus(); }
    });
  })
  .catch((error) => {
    dialog.showErrorBox('Dextana could not start', error.message);
    app.quit();
  });
app.on('window-all-closed', () => app.quit());
