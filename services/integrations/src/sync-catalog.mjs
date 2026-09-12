import { mkdir, writeFile, rename } from 'node:fs/promises';
import { loadCatalog } from './load-catalog.mjs';
const engine = 'https://fused.run.usefused.com';
const mcpId = '323aa26c-ea7b-45eb-87f6-b7b6ff01aa75';
const config = { engine, cli: process.env.FUSED_CLI_PATH };
const catalog = await loadCatalog(config, mcpId);
const directory = new URL('../catalog/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('catalog.tmp', directory), JSON.stringify(catalog, null, 2) + '\n');
await rename(new URL('catalog.tmp', directory), new URL('catalog.json', directory));
console.log(
  `Saved ${catalog.providers.length} providers and ${catalog.providers.reduce((n, p) => n + p.operations.length, 0)} operations from ${catalog.versionId}.`,
);
