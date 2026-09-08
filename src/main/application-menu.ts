import { app, Menu, type MenuItemConstructorOptions } from 'electron';

export function installApplicationMenu(openSettings: () => void) {
  const settings: MenuItemConstructorOptions = {
    id: 'open-settings',
    label: 'Settings…',
    accelerator: 'CommandOrControl+,',
    click: openSettings,
  };
  const applicationMenu: MenuItemConstructorOptions = process.platform === 'darwin'
    ? {
        label: app.getName(),
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          settings,
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      }
    : { label: 'File', submenu: [settings, { type: 'separator' }, { role: 'quit' }] };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    applicationMenu,
    ...(process.platform === 'darwin' ? [{ role: 'fileMenu' as const }] : []),
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]));
}
