import { expect, test } from 'vitest';
import { browserResourceAllowed } from '../../src/main/browser-network';
const viewer = 'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html';
test('PDF viewer can load its bundled modules without exposing privileged schemes to pages', () => {
  expect(browserResourceAllowed(viewer)).toBe(true);
  expect(browserResourceAllowed('chrome://resources/lit/v3_0/lit.rollup.js', viewer, 'script')).toBe(true);
  expect(browserResourceAllowed('chrome://resources/lit/v3_0/lit.rollup.js', 'https://example.com', 'script')).toBe(false);
  expect(browserResourceAllowed('chrome://resources/', viewer, 'mainFrame')).toBe(false);
  expect(browserResourceAllowed('chrome://settings/', viewer, 'script')).toBe(false);
  expect(browserResourceAllowed('chrome-extension://other/index.html')).toBe(false);
  expect(browserResourceAllowed('file:///etc/passwd')).toBe(false);
});
