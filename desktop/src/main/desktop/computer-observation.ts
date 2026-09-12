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

/** Exclude app/global menus from the automatically resolved window observation. */
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

export function windowObservation(result: ComputerResult) {
  if (typeof result.data.snapshot_id !== 'string' || !Array.isArray(result.data.elements))
    throw new Error('The application window has no usable accessibility snapshot.');
  const elements = windowElements(result.data.elements);
  const { tree_markdown: _tree, elements: _elements, ...data } = result.data;
  return {
    ...data,
    snapshot_id: result.data.snapshot_id,
    elements,
    returned_element_count: elements.length,
  };
}
