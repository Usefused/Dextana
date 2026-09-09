/** Deliberately renders every received field: display filtering cannot hide a tool-boundary regression. */
export function downloadDisplays(records: Record<string, unknown>[]): string[] {
  const columns = [...new Set(records.flatMap(record => Object.keys(record)))];
  const rows = records.map(record => columns.map(column => record[column] ?? null));
  const a2ui = [
    { version: 'v0.9', createSurface: { surfaceId: 'downloads', catalogId: 'urn:dextana:display:1' } },
    { version: 'v0.9', updateComponents: { surfaceId: 'downloads', components: [
      { id: 'root', component: 'Table', title: 'Download status', columns, rows },
    ] } },
  ].map(item => JSON.stringify(item)).join('\n');
  const markdown = [columns, columns.map(() => '---'), ...rows]
    .map(row => `| ${row.join(' | ')} |`).join('\n');
  return [JSON.stringify({ downloads: records }), markdown, '```a2ui\n' + a2ui + '\n```'];
}
