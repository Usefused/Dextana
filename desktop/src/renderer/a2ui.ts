export type UIComponent = { id: string; component: string; [key: string]: unknown };
export interface UISurface {
  id: string;
  components: Map<string, UIComponent>;
  data: unknown;
}
export interface UIResult {
  surfaces: UISurface[];
  pending: boolean;
  error?: string;
}
const operations = ['createSurface', 'updateComponents', 'updateDataModel', 'deleteSurface'];
const catalogs = new Set([
  'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json',
  'urn:dextana:display:1',
]);
export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function segments(path: string) {
  if (path === '' || path === '/') return [];
  if (!path.startsWith('/')) throw new Error('Data bindings must use an absolute JSON Pointer.');
  const parts = path
    .slice(1)
    .split('/')
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
  if (parts.some((part) => ['__proto__', 'constructor', 'prototype'].includes(part)))
    throw new Error('Invalid data path.');
  return parts;
}
export function boundValue(value: unknown, data: unknown): unknown {
  if (!record(value)) return value;
  if (typeof value.path !== 'string') throw new Error('Unsupported dynamic value.');
  return segments(value.path).reduce<unknown>((current, key) => {
    if ((!record(current) && !Array.isArray(current)) || !Object.hasOwn(current, key))
      return undefined;
    return (current as Record<string, unknown>)[key];
  }, data);
}
function updateData(data: unknown, path: string, value: unknown): unknown {
  const parts = segments(path);
  if (!parts.length) return value;
  const root = record(data) || Array.isArray(data) ? structuredClone(data) : Object.create(null);
  let current = root;
  for (const key of parts.slice(0, -1)) {
    if (!Object.hasOwn(current, key) || (!record(current[key]) && !Array.isArray(current[key])))
      current[key] = Object.create(null);
    current = current[key];
  }
  const key = parts.at(-1)!;
  if (value === undefined) delete current[key];
  else current[key] = value;
  return root;
}

// Replaying the accumulated text makes persisted transcripts render identically after restart.
export function parseA2UI(source: string): UIResult | null {
  if (
    !/"(?:createSurface|updateComponents|updateDataModel|deleteSurface|surfaceUpdate|beginRendering)"\s*:/.test(
      source,
    )
  )
    return null;
  const surfaces = new Map<string, UISurface>();
  let pending = false;
  try {
    if (source.length > 500_000) throw new Error('UI response exceeds the display limit.');
    let messages: unknown[];
    try {
      const parsed: unknown = JSON.parse(source);
      messages = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      messages = [];
      const lines = source.trimEnd().split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        try {
          messages.push(JSON.parse(lines[i]));
        } catch {
          if (i === lines.length - 1) pending = true;
          else throw new Error('Invalid A2UI JSON.');
        }
      }
    }
    if (messages.length > 1000) throw new Error('Too many UI updates.');
    for (const message of messages) {
      if (!record(message) || message.version !== 'v0.9')
        throw new Error('This renderer supports A2UI v0.9 display components.');
      const keys = operations.filter((key) => Object.hasOwn(message, key));
      if (keys.length !== 1) throw new Error('Invalid A2UI message.');
      const operation = keys[0];
      const body = message[operation];
      if (!record(body) || typeof body.surfaceId !== 'string')
        throw new Error('A surface ID is required.');
      const id = body.surfaceId;
      if (operation === 'createSurface') {
        if (surfaces.has(id)) throw new Error('Duplicate UI surface.');
        if (typeof body.catalogId !== 'string' || !catalogs.has(body.catalogId))
          throw new Error('Unsupported UI catalog.');
        surfaces.set(id, { id, components: new Map(), data: {} });
      } else if (operation === 'deleteSurface') surfaces.delete(id);
      else {
        const surface = surfaces.get(id);
        if (!surface) throw new Error('Create the UI surface before updating it.');
        if (operation === 'updateComponents') {
          if (!Array.isArray(body.components)) throw new Error('A component list is required.');
          for (const item of body.components) {
            if (!record(item) || typeof item.id !== 'string' || typeof item.component !== 'string')
              throw new Error('Invalid UI component.');
            surface.components.set(item.id, item as UIComponent);
          }
          if (surface.components.size > 200) throw new Error('Too many UI components.');
        } else
          surface.data = updateData(
            surface.data,
            typeof body.path === 'string' ? body.path : '/',
            body.value,
          );
      }
    }
    return { surfaces: [...surfaces.values()], pending };
  } catch (error) {
    return { surfaces: [], pending: false, error: (error as Error).message };
  }
}
