import { afterEach, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';
import { hasLoginForm } from '../../src/main/login-detection';

afterEach(() => vi.useRealTimers());

it('ignores an embedded login until its containing frame is visible', async () => {
  let visibleFrames: number[] = [];
  const root: any = { parent: null };
  const child = {
    parent: root,
    executeJavaScript: async () => ({ needed: true, index: 0, visibleFrames: [] }),
  };
  root.framesInSubtree = [root, child];
  const contents = {
    mainFrame: root,
    executeJavaScriptInIsolatedWorld: async () => ({ needed: false, index: -1, visibleFrames }),
  } as unknown as WebContents;
  expect(await hasLoginForm(contents)).toBe(false);
  visibleFrames = [0];
  expect(await hasLoginForm(contents)).toBe(true);
});

it('bounds an unresponsive frame check without treating it as a disappeared login form', async () => {
  vi.useFakeTimers();
  const root: any = { parent: null };
  root.framesInSubtree = [root];
  const contents = {
    mainFrame: root,
    executeJavaScriptInIsolatedWorld: () => new Promise(() => {}),
  } as unknown as WebContents;
  const check = hasLoginForm(contents);
  await vi.advanceTimersByTimeAsync(801);
  expect(await check).toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
});
