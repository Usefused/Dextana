export const browserKeys: Record<string, string> = {
  Enter: 'Return', Backspace: 'Backspace', Delete: 'Delete', Tab: 'Tab', Escape: 'Escape',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
  Space: 'Space', 'Shift+Tab': 'Tab',
};
export function browserKey(value: unknown) {
  if (value === 'Esc') value = 'Escape';
  if (value === 'Return') value = 'Enter';
  if (typeof value !== 'string' || (!Object.hasOwn(browserKeys, value) && !['SelectAll', 'Copy', 'Paste'].includes(value)))
    throw new Error('Choose a supported browser key: Enter (Return), Escape (Esc), Space, Tab, Shift+Tab, Backspace, Delete, arrow keys, Home, End, PageUp, PageDown, SelectAll, Copy, or Paste.');
  return value;
}
