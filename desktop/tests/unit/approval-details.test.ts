import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ApprovalDetails } from '../../src/renderer/ApprovalDetails';

test('approval inputs remain proposed values and cannot be mistaken for a successful file receipt', () => {
  const output = renderToStaticMarkup(React.createElement(ApprovalDetails, { arguments: JSON.stringify({ path: '/Documents/Budget.xlsx', created: true, arguments_json: '{"recipient":"Sam","body":"Review this"}' }) }));
  expect(output).toContain('Budget.xlsx');
  expect(output).toContain('<dt>Created</dt><dd><span>Yes</span>');
  expect(output).toContain('Sam');
  expect(output).not.toContain('Find it in');
  expect(output).not.toContain('&quot;recipient&quot;');
});
