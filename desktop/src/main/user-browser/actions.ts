import { httpURL } from './protocol';

const keys = new Set([
  'Enter',
  'Escape',
  'Tab',
  'Backspace',
  'Delete',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'Space',
]);
function number(value: unknown, minimum: number, maximum: number, fallback: number) {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum)
    throw new Error('Browser coordinates or pagination are outside the supported range.');
  return value;
}
function reference(value: unknown) {
  if (typeof value !== 'string' || !/^[a-f0-9-]{36}:\d+$/.test(value))
    throw new Error('Read the page and use an observed element reference.');
  return value;
}
function read(args: Record<string, unknown>) {
  const offset = number(args.offset, 0, 1_000_000, 0);
  const limit = number(args.limit, 1, 1000, 100);
  const text_offset = number(args.text_offset, 0, 10_000_000, 0);
  if (![offset, limit, text_offset].every(Number.isInteger))
    throw new Error('Pagination must use whole numbers.');
  return { offset, limit, text_offset, ...(args.ref ? { ref: reference(args.ref) } : {}) };
}
function fill(args: Record<string, unknown>) {
  if (typeof args.text !== 'string' || args.text.length > 100_000)
    throw new Error('Provide at most 100,000 characters to fill.');
  return { ref: reference(args.ref), text: args.text };
}
function press(args: Record<string, unknown>) {
  if (!keys.has(String(args.key)))
    throw new Error('This key is unavailable on the attached browser tab.');
  return { key: args.key, ...(args.ref ? { ref: reference(args.ref) } : {}) };
}
function pointer(args: Record<string, unknown>) {
  if (args.click_count !== undefined && args.click_count !== 1)
    throw new Error('Attached tabs currently support single clicks.');
  return { ref: reference(args.ref) };
}
function scroll(args: Record<string, unknown>) {
  return {
    x: number(args.x, 0, 100_000, 0),
    y: number(args.y, 0, 100_000, 0),
    delta_x: number(args.delta_x, -10_000, 10_000, 0),
    delta_y: number(args.delta_y, -10_000, 10_000, 0),
  };
}
const actions: Record<string, (args: Record<string, unknown>) => Record<string, unknown>> = {
  read,
  fill,
  press,
  click: pointer,
  hover: pointer,
  scroll,
  screenshot: () => ({}),
  list_tabs: () => ({}),
  downloads: () => ({}),
  open: (args) => ({ url: httpURL(args.url) }),
  new_tab: (args) => ({ url: httpURL(args.url) }),
  close_tab: () => ({}),
  disconnect_user: () => ({}),
};
/** Forward authored action fields only; the model cannot select CDP methods or inject script. */
export function browserArguments(args: Record<string, unknown>) {
  if (args.screenshot_id || (args.coordinate_space && args.coordinate_space !== 'viewport'))
    return screenshotArguments(args);
  const action = String(args.action);
  if (!Object.hasOwn(actions, action))
    throw new Error('This action is unavailable on your attached browser tab.');
  return { action, ...actions[action](args) };
}

function screenshotArguments(args: Record<string, unknown>) {
  const action = String(args.action);
  if (!['click', 'hover', 'scroll'].includes(action) || args.ref)
    throw new Error('Screenshot targeting requires click, hover or scroll without a ref.');
  if (!['screenshot', 'normalized'].includes(String(args.coordinate_space)))
    throw new Error('Choose screenshot or normalized coordinates.');
  if (typeof args.screenshot_id !== 'string' || !/^[a-f0-9-]{36}$/.test(args.screenshot_id))
    throw new Error('Use the screenshot_id from a fresh screenshot of this tab.');
  if (args.click_count !== undefined && args.click_count !== 1)
    throw new Error('Attached tabs currently support single clicks.');
  return {
    action,
    ...scroll(args),
    x: number(args.x, 0, 100_000, -1),
    y: number(args.y, 0, 100_000, -1),
    screenshot_id: args.screenshot_id,
    coordinate_space: args.coordinate_space,
  };
}
