import { expect, test } from 'vitest';
import { parseA2UI, boundValue } from '../../src/renderer/a2ui';
import { externalURL } from '../../src/shared/links';
const create = {
  version: 'v0.9',
  createSurface: { surfaceId: 'card', catalogId: 'urn:dextana:display:1' },
};
const stream = (...messages: unknown[]) =>
  messages.map((value) => JSON.stringify(value)).join('\n');

test('A2UI replays components, data binding updates and surface deletion', () => {
  const source = stream(
    create,
    {
      version: 'v0.9',
      updateComponents: {
        surfaceId: 'card',
        components: [{ id: 'root', component: 'Text', text: { path: '/name' } }],
      },
    },
    { version: 'v0.9', updateDataModel: { surfaceId: 'card', value: { name: 'Before' } } },
    { version: 'v0.9', updateDataModel: { surfaceId: 'card', path: '/name', value: 'After' } },
  );
  const result = parseA2UI(source)!;
  expect(result.error).toBeUndefined();
  expect(boundValue(result.surfaces[0].components.get('root')!.text, result.surfaces[0].data)).toBe(
    'After',
  );
  expect(parseA2UI(source + '\n{"version":')).toMatchObject({ pending: true });
  expect(
    parseA2UI(source + '\n' + stream({ version: 'v0.9', deleteSurface: { surfaceId: 'card' } }))!
      .surfaces,
  ).toEqual([]);
});

test('A2UI rejects unsupported versions, catalogs and unsafe data paths', () => {
  expect(parseA2UI(stream({ ...create, version: 'v0.8' }))?.error).toContain('v0.9');
  expect(
    parseA2UI(stream({ ...create, createSurface: { surfaceId: 'card', catalogId: 'unknown' } }))
      ?.error,
  ).toContain('catalog');
  expect(
    parseA2UI(
      stream(create, {
        version: 'v0.9',
        updateDataModel: { surfaceId: 'card', path: '/__proto__/polluted', value: true },
      }),
    )?.error,
  ).toContain('Invalid data path');
  expect(({} as any).polluted).toBeUndefined();
  expect(parseA2UI('ordinary response')).toBeNull();
});

test('only ordinary external web links can be opened', () => {
  expect(externalURL('https://example.com/page')).toBe('https://example.com/page');
  for (const url of [
    'javascript:alert(1)',
    'data:text/html,test',
    'file:///etc/passwd',
    '/relative',
    'https://user:secret@example.com',
  ])
    expect(externalURL(url)).toBeUndefined();
});
