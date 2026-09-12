import { cli } from './fused.mjs';
import { catalogFromCLI } from './catalog.mjs';
export async function loadCatalog(config, mcpId = '323aa26c-ea7b-45eb-87f6-b7b6ff01aa75') {
  let servers = [],
    offset = 0;
  while (true) {
    const page = await cli(
      ['mcp', 'list', '--json', '--limit', '100', '--offset', String(offset)],
      config,
    );
    if (!Array.isArray(page.items) || !Number.isSafeInteger(page.total))
      throw new Error('Invalid MCP page.');
    servers.push(...page.items);
    offset += page.items.length;
    if (offset >= page.total) break;
    if (!page.items.length || offset > 10_000) throw new Error('Incomplete MCP list.');
  }
  const matches = servers.filter(
    (item) => item.app_family_id === mcpId && item.stable && item.app_id === item.stable_version_id,
  );
  if (matches.length !== 1) throw new Error('Cannot resolve the stable MCP version.');
  const server = matches[0];
  const operations = await cli(['mcp', 'operations', server.app_id, '--json'], config);
  const services = await cli(['workspace', 'services', 'list', '--json'], config);
  return catalogFromCLI(server, operations, services);
}
