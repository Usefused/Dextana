import { expect, it } from 'vitest';
import { browserKey } from '../../src/main/browser-keys';
it('accepts only browser-scoped keyboard actions', () => {
  for (const key of ['Enter', 'Escape', 'Space', 'Tab', 'Shift+Tab', 'Backspace', 'ArrowLeft', 'SelectAll', 'Copy', 'Paste']) expect(browserKey(key)).toBe(key);
  expect(browserKey('Esc')).toBe('Escape');
  expect(browserKey('Return')).toBe('Enter');
  for (const key of ['Meta+Q', 'Control+L', 'constructor', '__proto__', undefined, {}, '']) expect(() => browserKey(key)).toThrow();
});
