import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopAPI } from '../shared/types';
const api: DesktopAPI = {
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
  snapshot: () => ipcRenderer.invoke('snapshot'),
  models: (url) => ipcRenderer.invoke('models', url),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  start: (input) => ipcRenderer.invoke('activity:start', input),
  cancel: (id) => ipcRenderer.invoke('activity:cancel', id),
  showBrowser: (id) => ipcRenderer.invoke('browser:show', id),
  hideBrowser: () => ipcRenderer.invoke('browser:hide'),
  selectActivity: (id) => ipcRenderer.invoke('activity:select', id),
  saveFusedAccount: input => ipcRenderer.invoke('fused:account:save', input),
  removeFusedAccount: () => ipcRenderer.invoke('fused:account:remove'),
  removeFused: id => ipcRenderer.invoke('fused:remove', id),
  saveFused: (input) => ipcRenderer.invoke('fused:save', input),
  approve: (input) => ipcRenderer.invoke('activity:approve', input),
  setPermission: (input) => ipcRenderer.invoke('activity:permission', input),
  subscribe: (callback) => {
    const listener = (_event: unknown, snapshot: Parameters<typeof callback>[0]) =>
      callback(snapshot);
    ipcRenderer.on('state', listener);
    return () => ipcRenderer.removeListener('state', listener);
  },
};
contextBridge.exposeInMainWorld('dextana', api);
