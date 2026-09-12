import { expect, test, vi } from 'vitest';
vi.mock('electron', () => ({
  app: { isPackaged: false, getName: () => 'Dext' },
  Menu: { buildFromTemplate: vi.fn(value => value), setApplicationMenu: vi.fn() },
}));
import { app, Menu } from 'electron';
import { installApplicationMenu } from '../../src/main/application-menu';

test('agent rebuilding is exposed only in development', () => {
  const restart = vi.fn();
  installApplicationMenu(() => {}, restart);
  const template = vi.mocked(Menu.buildFromTemplate).mock.calls.at(-1)![0];
  const development = template.find(item => item.label === 'Development')!;
  const command = (development.submenu as any[])[0];
  expect(command.accelerator).toBe('CommandOrControl+Shift+R');
  command.click();
  expect(restart).toHaveBeenCalledOnce();
  Object.assign(app, { isPackaged: true });
  installApplicationMenu(() => {}, restart);
  expect(vi.mocked(Menu.buildFromTemplate).mock.calls.at(-1)![0].some(item => item.label === 'Development')).toBe(false);
});
