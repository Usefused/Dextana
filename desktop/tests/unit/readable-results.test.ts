import { expect, test } from 'vitest';
import { readableResponse, readableData } from '../../src/shared/readable-results';

test('inline code and escaped brackets remain literal, including while streaming', () => {
  for (const text of [
    'Use `[1, 2]` and `{"example": true}` here.',
    'Use ``a `tick` and [1, 2]``.',
    'Literal \\[1, 2] stays.',
    'An unfinished `{"key":',
  ]) {
    expect(readableResponse(text)).toBe(text);
    expect(readableResponse(text, true)).toBe(text);
  }
});

test('formats prose-wrapped JSON, nested MCP results, and Excel data without losing values', () => {
  expect(readableResponse('Done: {"total_cost":330,"confirmed":false}')).toContain(
    '**Total cost:** 330',
  );
  expect(readableResponse('Done: {"total_cost":330,"confirmed":false}')).toContain(
    '**Confirmed:** No',
  );
  expect(
    readableData({
      content: [{ type: 'text', text: '{"status":"Failed","reason":"Permission denied"}' }],
      isError: true,
    }),
  ).toContain('Permission denied');
  expect(
    readableData({ content: [{ type: 'text', text: '{"status":"Failed"}' }], isError: true }),
  ).not.toContain('Created');
  expect(
    readableData({
      sheets: [
        {
          name: 'Budget',
          rows: [
            ['Item', 'Cost'],
            ['Travel', 250],
          ],
        },
      ],
    }),
  ).toContain('| Travel | 250 |');
});
test('buffers unfinished structured output and keeps surrounding prose', () => {
  expect(readableResponse('Here is your result:\n```json\n{"amount":', true)).toBe(
    'Here is your result:\n\n\nPreparing results…\n\n',
  );
  expect(readableResponse('{"unfinished":', false)).not.toContain('unfinished');
  expect(readableResponse('{"name":"A } bracket"}')).toContain('A } bracket');
  expect(readableResponse('Before {"value":4} after')).toContain('after');
});
test('keeps Markdown and display fences intact, and formats double-encoded JSON', () => {
  const markdown = '[Documentation](https://example.com)\n\n```ts\nconst value = {x: 1};\n```';
  expect(readableResponse(markdown)).toBe(markdown);
  const ui = '```a2ui\n{"createSurface":{"surfaceId":"one"}}\n```';
  expect(readableResponse(ui)).toBe(ui);
  expect(readableResponse('Result: ' + JSON.stringify('{"message":"Success"}'))).toContain(
    '**Message:** Success',
  );
});
test('escapes untrusted values and does not turn errors into success receipts', () => {
  expect(readableData({ message: '[click](javascript:alert(1))' })).toContain('\\[click\\]');
  expect(readableData({ path: '/Documents/Budget.xlsx', created: true })).toContain(
    'Created **Budget.xlsx**',
  );
  expect(
    readableData({ path: '/Documents/Budget.xlsx', created: true, error: 'Save failed' }),
  ).toContain('Save failed');
  expect(
    readableData({ path: '/Documents/Budget.xlsx', created: true, error: 'Save failed' }),
  ).not.toContain('Find it in');
});

test('malformed JSON fences show a readable recovery message rather than payload syntax', () => {
  expect(readableResponse('```json\n{broken: true}\n```')).not.toContain('{broken');
  expect(readableResponse('```json\n{broken: true}\n```')).toContain('summarize it again');
});

test('numeric Markdown links and citation labels remain usable', () => {
  expect(readableResponse('See [2026](https://example.com/report) and reference [1].')).toBe(
    'See [2026](https://example.com/report) and reference [1].',
  );
});

test('MCP structured details survive even when no text content was returned', () => {
  const result = readableData({ content: [], structuredContent: { total: 330, currency: 'GBP' } });
  expect(result).toContain('**Details**');
  expect(result).toContain('330');
  expect(result).toContain('GBP');
});
