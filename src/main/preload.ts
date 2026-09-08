import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopAPI } from '../shared/types';
const api: DesktopAPI = {
  decidePlan: input => ipcRenderer.invoke('activity:plan', input),
  copyLoginCode: id => ipcRenderer.invoke('browser:login:copy', id),
  openLoginExtension: id => ipcRenderer.invoke('browser:login:extension', id),
  onLoginOffer: callback => {
    const listener = (_event: unknown, id: string) => callback(id);
    ipcRenderer.on('browser:login:offer', listener);
    return () => ipcRenderer.removeListener('browser:login:offer', listener);
  },
  onOpenSettings: listener => {
    const handler = () => listener();
    ipcRenderer.on('settings:open', handler);
    return () => { ipcRenderer.removeListener('settings:open', handler); };
  },
  beginLoginTransfer: id => ipcRenderer.invoke('browser:login:begin', id),
  loginTransferStatus: id => ipcRenderer.invoke('browser:login:status', id),
  cancelLoginTransfer: id => ipcRenderer.invoke('browser:login:cancel', id),
  attachContext: (activityId, paths) => ipcRenderer.invoke('files:attach', activityId, paths),
  pickFiles: () => ipcRenderer.invoke('files:pick'),
  revealFile: (activityId, itemId) => ipcRenderer.invoke('files:reveal', activityId, itemId),
  saveMCP: input => ipcRenderer.invoke('mcp:save', input),
  testMCP: id => ipcRenderer.invoke('mcp:test', id),
  setMCPTools: (id, policies) => ipcRenderer.invoke('mcp:tools', id, policies),
  removeMCP: id => ipcRenderer.invoke('mcp:remove', id),
  createFolder: name => ipcRenderer.invoke('folder:create', name),
  updateFolder: (id, changes) => ipcRenderer.invoke('folder:update', id, changes),
  deleteFolder: id => ipcRenderer.invoke('folder:delete', id),
  moveActivity: (id, folderId) => ipcRenderer.invoke('activity:move', id, folderId),
  archiveActivity: (id, archived) => ipcRenderer.invoke('activity:archive', id, archived),
  openLink: (url) => ipcRenderer.invoke('link:open', url),
  saveCronJob: (input, id) => ipcRenderer.invoke('cron:save', input, id),
  removeCronJob: id => ipcRenderer.invoke('cron:remove', id),
  runCronJob: id => ipcRenderer.invoke('cron:run', id),
  snapshot: () => ipcRenderer.invoke('snapshot'),
  models: (url) => ipcRenderer.invoke('models', url),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  start: (input) => ipcRenderer.invoke('activity:start', input),
  cancel: (id) => ipcRenderer.invoke('activity:cancel', id),
  showBrowser: (id, tabId) => ipcRenderer.invoke('browser:show', id, tabId),
  newBrowserTab: (id, url) => ipcRenderer.invoke('browser:new', id, url),
  closeBrowserTab: id => ipcRenderer.invoke('browser:close', id),
  hideBrowser: () => ipcRenderer.invoke('browser:hide'),
  selectActivity: (id) => ipcRenderer.invoke('activity:select', id),
  loginFused: url => ipcRenderer.invoke('fused:login', url),
  cancelFusedLogin: () => ipcRenderer.invoke('fused:login:cancel'),
  discoverFused: () => ipcRenderer.invoke('fused:discover'),
  logoutFused: () => ipcRenderer.invoke('fused:logout'),
  selectFusedServer: (id, autoToken, operations) => ipcRenderer.invoke('fused:select', id, autoToken, operations),
  saveFusedAccount: input => ipcRenderer.invoke('fused:account:save', input),
  removeFusedAccount: () => ipcRenderer.invoke('fused:account:remove'),
  removeFused: id => ipcRenderer.invoke('fused:remove', id),
  saveFused: (input) => ipcRenderer.invoke('fused:save', input),
  approve: (input) => ipcRenderer.invoke('activity:approve', input),
  setSessionApprovals: (id, allowAll) => ipcRenderer.invoke('activity:session-approvals', id, allowAll),
  setPermission: (input) => ipcRenderer.invoke('activity:permission', input),
  subscribe: (callback) => {
    const listener = (_event: unknown, snapshot: Parameters<typeof callback>[0]) =>
      callback(snapshot);
    ipcRenderer.on('state', listener);
    return () => ipcRenderer.removeListener('state', listener);
  },
};
contextBridge.exposeInMainWorld('dextana', api);
