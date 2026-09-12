import { beforeEach, expect, test, vi } from 'vitest';

const native = vi.hoisted(() => {
  const windows: Record<string, any>[] = [];
  const BrowserWindow = vi.fn(function () {
    const events = new Map<string, () => void>();
    const webEvents = new Map<string, () => void>();
    const window = {
      webContents: {
        once: vi.fn((name: string, listener: () => void) => webEvents.set(name, listener)),
        executeJavaScript: vi.fn(async () => undefined),
      },
      setAlwaysOnTop: vi.fn(),
      setIgnoreMouseEvents: vi.fn(),
      setVisibleOnAllWorkspaces: vi.fn(),
      once: vi.fn((name: string, listener: () => void) => events.set(name, listener)),
      loadURL: vi.fn(async () => undefined),
      setPosition: vi.fn(),
      showInactive: vi.fn(),
      isDestroyed: vi.fn(() => false),
      destroy: vi.fn(() => events.get('closed')?.()),
      events,
      webEvents,
    };
    windows.push(window);
    return window;
  });
  return { BrowserWindow, windows };
});

vi.mock('electron', () => ({ BrowserWindow: native.BrowserWindow }));

import { agentCursorMarkup } from '../../src/main/agent-cursor';
import { DextComputerCursor } from '../../src/main/desktop/cursor';

beforeEach(() => {
  vi.clearAllMocks();
  native.windows.length = 0;
});

test('desktop cursor uses the shared green visual, glides, and animates out', () => {
  vi.useFakeTimers();
  const cursor = new DextComputerCursor();
  cursor.move({ frame: { x: 100, y: 50, w: 40, h: 20 } }, 'click');

  const first = native.windows[0];
  expect(native.BrowserWindow).toHaveBeenCalledWith(
    expect.objectContaining({ width: 36, height: 36, transparent: true }),
  );
  expect(first.setPosition).toHaveBeenCalledWith(102, 42, false);
  const page = decodeURIComponent(first.loadURL.mock.calls[0][0].split(',')[1]);
  expect(page).toContain(agentCursorMarkup);
  expect(page).toContain('background:#3d654c');

  first.webEvents.get('did-finish-load')?.();
  expect(first.showInactive).toHaveBeenCalledOnce();
  cursor.move({ frame: { x: 200, y: 100, w: 40, h: 20 } }, 'click');
  expect(first.setPosition).toHaveBeenLastCalledWith(202, 92, true);

  cursor.hide();
  expect(first.webContents.executeJavaScript).toHaveBeenCalledWith(
    "document.body.classList.add('leaving')",
  );
  expect(first.destroy).not.toHaveBeenCalled();
  vi.advanceTimersByTime(180);
  expect(first.destroy).toHaveBeenCalledOnce();

  cursor.move({ frame: { x: 10, y: 10, w: 10, h: 10 } }, 'type');
  expect(native.BrowserWindow).toHaveBeenCalledTimes(2);
  cursor.dispose();
  expect(native.windows[1].destroy).toHaveBeenCalledOnce();
  vi.useRealTimers();
});
