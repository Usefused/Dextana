import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopAPI } from '../shared/types';
const api: DesktopAPI = {
  teach: (command) => ipcRenderer.invoke('teach:command', command),
  taughtSkills: () => ipcRenderer.invoke('teach:skills'),
  answerQuestions: (input) => ipcRenderer.invoke('activity:answer-questions', input),
  notification: (command) => ipcRenderer.invoke('notifications', command),
  onOpenNotifications: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('notifications:open', listener);
    return () => ipcRenderer.removeListener('notifications:open', listener);
  },
  userBrowserPairing: (activityId) => ipcRenderer.invoke('browser:user:pairing', activityId),
  beginUserBrowser: (activityId) => ipcRenderer.invoke('browser:user:begin', activityId),
  stopUserBrowser: (activityId) => ipcRenderer.invoke('browser:user:stop', activityId),
  resetUserBrowser: (activityId) => ipcRenderer.invoke('browser:user:reset', activityId),
  openBrowserExtension: () => ipcRenderer.invoke('browser:user:extension'),
  desktopComputer: (request) => ipcRenderer.invoke('desktop:computer', request),
  desktopAlarm: (request) => ipcRenderer.invoke('desktop:alarm', request),
  desktopWorkflow: (operation, args, activityId) =>
    ipcRenderer.invoke('desktop:workflow', operation, args, activityId),
  setDesktopBackground: (enabled) => ipcRenderer.invoke('desktop:background', enabled),
  openDesktopContext: (activityId, itemId) =>
    ipcRenderer.invoke('desktop:context', activityId, itemId),
  onOpenDesktop: (callback) => {
    const listener = (_event: unknown, resourceId?: string) => callback(resourceId);
    ipcRenderer.on('desktop:open', listener);
    return () => ipcRenderer.removeListener('desktop:open', listener);
  },
  openFile: (activityId, itemId) => ipcRenderer.invoke('files:open', activityId, itemId),
  onOpenActivity: (callback) => {
    const listener = (_event: unknown, activityId: string) => callback(activityId);
    ipcRenderer.on('activity:open', listener);
    return () => ipcRenderer.removeListener('activity:open', listener);
  },
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
  loadImage: (url) => ipcRenderer.invoke('image:load', url),
  setTheme: (theme) => ipcRenderer.invoke('appearance:theme', theme),
  selectModel: (id, model, reasoning) => ipcRenderer.invoke('activity:model', id, model, reasoning),
  modelReasoning: (url, model) => ipcRenderer.invoke('model:reasoning', url, model),
  resume: (activityId) => ipcRenderer.invoke('activity:resume', activityId),
  steer: (activityId, messageId) => ipcRenderer.invoke('activity:steer', activityId, messageId),
  editMessage: (input) => ipcRenderer.invoke('activity:edit-message', input),
  updateQueuedMessage: (input) => ipcRenderer.invoke('activity:update-queued-message', input),
  decidePlan: (input) => ipcRenderer.invoke('activity:plan', input),
  copyLoginCode: (id) => ipcRenderer.invoke('browser:login:copy', id),
  openLoginExtension: (id) => ipcRenderer.invoke('browser:login:extension', id),
  onLoginOffer: (callback) => {
    const listener = (_event: unknown, id: string) => callback(id);
    ipcRenderer.on('browser:login:offer', listener);
    return () => ipcRenderer.removeListener('browser:login:offer', listener);
  },
  onOpenSettings: (listener) => {
    const handler = (_event: unknown, page?: 'computer') => listener(page);
    ipcRenderer.on('settings:open', handler);
    return () => {
      ipcRenderer.removeListener('settings:open', handler);
    };
  },
  beginLoginTransfer: (id) => ipcRenderer.invoke('browser:login:begin', id),
  loginTransferStatus: (id) => ipcRenderer.invoke('browser:login:status', id),
  cancelLoginTransfer: (id) => ipcRenderer.invoke('browser:login:cancel', id),
  attachContext: (activityId, paths) => ipcRenderer.invoke('files:attach', activityId, paths),
  pickFiles: () => ipcRenderer.invoke('files:pick'),
  revealFile: (activityId, itemId) => ipcRenderer.invoke('files:reveal', activityId, itemId),
  saveMCP: (input) => ipcRenderer.invoke('mcp:save', input),
  testMCP: (id) => ipcRenderer.invoke('mcp:test', id),
  setMCPTools: (id, policies) => ipcRenderer.invoke('mcp:tools', id, policies),
  removeMCP: (id) => ipcRenderer.invoke('mcp:remove', id),
  openMCPAuthentication: (id, surface) => ipcRenderer.invoke('mcp:auth:open', id, surface),
  dismissMCPAuthentication: (id) => ipcRenderer.invoke('mcp:auth:dismiss', id),
  createFolder: (name) => ipcRenderer.invoke('folder:create', name),
  updateFolder: (id, changes) => ipcRenderer.invoke('folder:update', id, changes),
  deleteFolder: (id) => ipcRenderer.invoke('folder:delete', id),
  moveActivity: (id, folderId) => ipcRenderer.invoke('activity:move', id, folderId),
  archiveActivity: (id, archived) => ipcRenderer.invoke('activity:archive', id, archived),
  openLink: (url) => ipcRenderer.invoke('link:open', url),
  saveCronJob: (input, id) => ipcRenderer.invoke('cron:save', input, id),
  removeCronJob: (id) => ipcRenderer.invoke('cron:remove', id),
  runCronJob: (id) => ipcRenderer.invoke('cron:run', id),
  snapshot: () => ipcRenderer.invoke('snapshot'),
  skills: () => ipcRenderer.invoke('skills:list'),
  saveSkill: (input) => ipcRenderer.invoke('skills:save', input),
  deleteSkill: (id) => ipcRenderer.invoke('skills:delete', id),
  importSkill: () => ipcRenderer.invoke('skills:import'),
  usage: (period) => ipcRenderer.invoke('usage', period),
  models: (connection, apiKey) => ipcRenderer.invoke('models', connection, apiKey),
  modelCatalog: (connection, apiKey, auth) =>
    ipcRenderer.invoke('modelCatalog', connection, apiKey, auth),
  saveSettings: (settings, apiKey, auth) =>
    ipcRenderer.invoke('settings:save', settings, apiKey, auth),
  start: (input) => ipcRenderer.invoke('activity:start', input),
  cancel: (id) => ipcRenderer.invoke('activity:cancel', id),
  showBrowser: (id, tabId) => ipcRenderer.invoke('browser:show', id, tabId),
  newBrowserTab: (id, url) => ipcRenderer.invoke('browser:new', id, url),
  browserDownload: (id, action) => ipcRenderer.invoke('browser:download', id, action),
  refreshBrowserTab: (id) => ipcRenderer.invoke('browser:refresh', id),
  closeBrowserTab: (id) => ipcRenderer.invoke('browser:close', id),
  hideBrowser: () => ipcRenderer.invoke('browser:hide'),
  setBrowserOverlay: (visible) => ipcRenderer.invoke('browser:overlay', visible),
  resizeBrowser: (width, dragging) => ipcRenderer.invoke('browser:resize', width, dragging),
  selectActivity: (id) => ipcRenderer.invoke('activity:select', id),
  fusedCLIStatus: () => ipcRenderer.invoke('fused:cli:status'),
  checkFusedCLI: () => ipcRenderer.invoke('fused:cli:check'),
  installFusedCLI: () => ipcRenderer.invoke('fused:cli:install'),
  cancelFusedCLIInstall: () => ipcRenderer.invoke('fused:cli:cancel'),
  chooseFusedCLI: () => ipcRenderer.invoke('fused:cli:choose'),
  useExistingFusedCLI: () => ipcRenderer.invoke('fused:cli:existing'),
  useManagedFusedCLI: () => ipcRenderer.invoke('fused:cli:managed'),
  loginFused: (url) => ipcRenderer.invoke('fused:login', url),
  cancelFusedLogin: () => ipcRenderer.invoke('fused:login:cancel'),
  fusedOperations: (id) => ipcRenderer.invoke('fused:operations', id),
  discoverFused: () => ipcRenderer.invoke('fused:discover'),
  logoutFused: () => ipcRenderer.invoke('fused:logout'),
  selectFusedServer: (id, autoToken, operations) =>
    ipcRenderer.invoke('fused:select', id, autoToken, operations),
  saveFusedAccount: (input) => ipcRenderer.invoke('fused:account:save', input),
  removeFusedAccount: () => ipcRenderer.invoke('fused:account:remove'),
  removeFused: (id) => ipcRenderer.invoke('fused:remove', id),
  saveFused: (input) => ipcRenderer.invoke('fused:save', input),
  approve: (input) => ipcRenderer.invoke('activity:approve', input),
  setSessionApprovals: (id, allowAll) =>
    ipcRenderer.invoke('activity:session-approvals', id, allowAll),
  integrations: (input) => ipcRenderer.invoke('integrations:command', input),
  setBrowserPreferences: (input) => ipcRenderer.invoke('browser:preferences', input),
  setPermission: (input) => ipcRenderer.invoke('activity:permission', input),
  subscribe: (callback) => {
    const listener = (_event: unknown, snapshot: Parameters<typeof callback>[0]) =>
      callback(snapshot);
    ipcRenderer.on('state', listener);
    return () => ipcRenderer.removeListener('state', listener);
  },
};
contextBridge.exposeInMainWorld('dextana', api);
