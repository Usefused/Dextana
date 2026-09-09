import type { ComputerResult } from './cua-adapter';

export const computerKeys = [
  'return',
  'tab',
  'escape',
  'up',
  'down',
  'left',
  'right',
  'backspace',
  'delete',
  'pageup',
  'pagedown',
  'home',
  'end',
  'space',
];

/** Cua includes app/global menus in native snapshots. A window grant excludes those branches. */
export function windowElements(values: unknown[]) {
  const rows = values.filter(
    (value): value is Record<string, unknown> => !!value && typeof value === 'object',
  );
  const root = rows.find((row) =>
    ['AXWindow', 'Window', 'window', 'frame', 'AXSheet', 'dialog'].includes(String(row.role)),
  );
  if (!root) return [];
  const allowed = new Set([root.element_index]);
  return rows.filter((row) => {
    if (row === root) return true;
    if (!allowed.has(row.parent_index)) return false;
    allowed.add(row.element_index);
    return true;
  });
}

export function scopedObservation(result: ComputerResult) {
  if (typeof result.data.snapshot_id !== 'string' || !Array.isArray(result.data.elements))
    throw new Error('This window has no usable accessibility snapshot.');
  const elements = windowElements(result.data.elements);
  // Return only the window tree: the SDK's Markdown duplicates excluded global menus.
  const { tree_markdown: _tree, elements: _elements, ...data } = result.data;
  return {
    ...data,
    snapshot_id: result.data.snapshot_id,
    elements,
    returned_element_count: elements.length,
  };
}
