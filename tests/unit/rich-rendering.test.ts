import { expect, test } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { A2UIView } from '../../src/renderer/A2UIView';
import { RichChart } from '../../src/renderer/RichChart';
import { MessageContent } from '../../src/renderer/MessageContent';

test('A2UI shares Markdown headings, accepts basic-catalog images and isolates bad children', () => {
  const source = JSON.stringify([
    {
      version: 'v0.9',
      createSurface: {
        surfaceId: 'one',
        catalogId: 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json',
      },
    },
    {
      version: 'v0.9',
      updateComponents: {
        surfaceId: 'one',
        components: [
          { id: 'root', component: 'Column', children: ['heading', 'bad', 'image'] },
          { id: 'heading', component: 'Text', variant: 'h2', text: 'A **formatted** title' },
          { id: 'bad', component: 'Column', children: ['bad'] },
          {
            id: 'image',
            component: 'Image',
            url: 'data:image/png;base64,iVBORw0KGgo=',
            description: 'Bound image',
          },
        ],
      },
    },
  ]);
  const html = renderToStaticMarkup(createElement(A2UIView, { source }));
  expect(html).toContain('<strong>formatted</strong>');
  expect(html).toContain('Invalid or oversized UI tree');
  expect(html).toContain('alt="Bound image"');
  expect(html).toContain('src="data:image/png;');
});
test('code, unsafe links and HTML remain inert while ordinary prose keeps its formatting', () => {
  const html = renderToStaticMarkup(
    createElement(MessageContent, {
      content:
        '**Clear text**\nflows naturally.\n\n`{"value": 1}` [Unsafe](javascript:alert) <script>alert(1)</script>',
    }),
  );
  expect(html).toContain('<strong>Clear text</strong>');
  expect(html).toContain('{&quot;value&quot;: 1}');
  expect(html).not.toContain('<script');
  expect(html).not.toContain('href="javascript:');
  expect(html).not.toContain('<br');
});
test('charts produce finite geometry for zero, negative, tiny and single-category values', () => {
  for (const values of [[0, 0], [-30, -10], [Number.MIN_VALUE, 0], [1]]) {
    const html = renderToStaticMarkup(
      createElement(RichChart, {
        value: {
          title: 'Values',
          type: 'line',
          labels: values.map((_, i) => String(i)),
          series: [{ name: 'Series', values }],
        },
      }),
    );
    expect(html).toContain('<svg');
    expect(html).not.toMatch(/NaN|Infinity/);
  }
});

test('generic renderers preserve business data even when its columns resemble download metadata', async () => {
  const { downloadDisplays } = await import('../helpers/download-display');
  const id = 'c0e89bca-d4ee-4cd5-b224-4e5e5080beb4';
  const record = { id, activityId: 'invoice-import', tabId: 'ledger', filename: 'receipt.pdf',
    state: 'completed', receivedBytes: 601, totalBytes: 601, path: '/Downloads/receipt.pdf' };
  for (const content of downloadDisplays([record])) {
    const html = renderToStaticMarkup(createElement(MessageContent, { content }));
    expect(html).toContain(id);
    expect(html).toContain('invoice-import');
    expect(html).toContain('ledger');
    expect(html).toContain('receipt.pdf');
  }
});
