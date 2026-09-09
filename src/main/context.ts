import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import type { Activity, ContextItem } from '../shared/types';
import { externalURL } from '../shared/links';

export function rememberFile(
  activity: Activity,
  path: string,
  status: 'selected' | 'read' | 'created',
) {
  remember(activity, { kind: 'file', location: path, name: basename(path), status });
}
export function rememberURL(activity: Activity, value: unknown, status: 'referenced' | 'visited') {
  const location = externalURL(value);
  if (location)
    remember(activity, {
      kind: 'url',
      location,
      name: new URL(location).hostname + new URL(location).pathname,
      status,
    });
}
export function rememberDesktop(activity: Activity, name: string, desktop: NonNullable<ContextItem['desktop']>) {
  remember(activity, { kind: 'desktop', name, location: `desktop:${desktop.work}:${desktop.resourceId}`, desktop, status: 'referenced' });
}
export function rememberReferences(activity: Activity, text: string) {
  for (const match of text.matchAll(/https?:\/\/[^\s<>"`]+/g))
    rememberURL(activity, match[0].replace(/[.,;!?\])}]+$/, ''), 'referenced');
}
function remember(activity: Activity, item: Omit<ContextItem, 'id'>) {
  const items = (activity.context ??= []);
  const existing = items.find(
    (entry) => entry.kind === item.kind && entry.location === item.location,
  );
  if (existing) {
    if (item.kind === 'desktop') { existing.name = item.name; existing.desktop = item.desktop; }
    if (item.status !== 'selected' && item.status !== 'referenced') existing.status = item.status;
  } else {
    items.push({ id: randomUUID(), ...item });
    if (items.length > 100) items.shift();
  }
}

export function findDesktopContext(activities: Activity[], activityId: string, itemId: string) {
  return activities.find(activity => activity.id === activityId)?.context?.find(item => item.id === itemId && item.kind === 'desktop');
}
