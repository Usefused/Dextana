import { Fault } from './core.mjs';
export function catalogFromCLI(server, operations, services) {
  if (
    !server ||
    server.status !== 'active' ||
    operations.version_id !== server.app_id ||
    operations.mcp_id !== server.app_family_id ||
    operations.total !== operations.operations?.length
  )
    throw new Error('The MCP catalog is incomplete or has changed versions.');
  const providers = [];
  for (const selection of server.selections ?? []) {
    if (selection.schema_version !== 3) throw new Error('Unsupported Fused selection schema.');
    if (!['oauth', 'oidc'].includes(selection.auth_type)) continue;
    const service = services.find((item) => item.service_id === selection.service_id);
    if (!service?.service_slug || !selection.auth_name)
      throw new Error('Provider identity is missing.');
    const selected = operations.operations.filter(
      (item) =>
        item.kind === 'physical' &&
        item.service_id === selection.service_id &&
        item.service_version_id === selection.service_version_id,
    );
    if (!selected.length) continue;
    providers.push({
      id: service.service_slug,
      name: service.service_name,
      serviceId: selection.service_id,
      authType: selection.auth_type,
      authName: selection.auth_name,
      authRef: selection.auth_ref || undefined,
      scopes: selection.connect_scopes ?? [],
      operations: selected
        .map((item) => ({ id: item.operation_id, name: operationLabel(item.operation_id) }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    });
  }
  return {
    mcpId: server.app_family_id,
    versionId: server.app_id,
    mcpUrl: server.transport_urls.versioned_streamable_http,
    generatedAt: new Date().toISOString(),
    providers: providers.sort((a, b) => a.name.localeCompare(b.name)),
  };
}
export function publicCatalog(catalog) {
  return {
    generatedAt: catalog.generatedAt,
    price: { amount: 1000, currency: 'gbp', interval: 'month' },
    providers: catalog.providers.map(({ id, name, operations }) => ({ id, name, operations })),
  };
}
export function provider(catalog, id) {
  const item = catalog.providers.find((p) => p.id === id);
  if (!item) throw new Fault(404, 'This integration is unavailable.');
  return item;
}

const labels = {
  'calendar.calendarList.list': 'List calendars',
  'calendar.events.delete': 'Delete an event',
  'calendar.events.get': 'Read an event',
  'calendar.events.insert': 'Create an event',
  'calendar.events.list': 'List events',
  'calendar.events.update': 'Update an event',
  'calendar.freebusy.query': 'Check availability',
  'gmail.users.drafts.create': 'Create an email draft',
  'gmail.users.drafts.send': 'Send a draft',
  'gmail.users.getProfile': 'Read your Gmail profile',
  'gmail.users.messages.get': 'Read an email',
  'gmail.users.messages.list': 'List emails',
  'gmail.users.messages.send': 'Send an email',
  'oauth2.userinfo.v2.me.get': 'Read your Google account profile',
};
function operationLabel(id) {
  return (
    labels[id] ??
    id
      .split('.')
      .slice(-2)
      .join(' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
  );
}
