import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backendProcesses } from './backend-build-guard.mjs';

test('detects only processes executing this bundle, including paths with spaces', () => {
  const output = '/project with spaces/.build/backend';
  assert.deepEqual(backendProcesses(output, [
    `  123 ${output}/python/bin/python3 -I -B ${output}/agent/harnest-agent serve`,
    `124 /bin/zsh -c ps | rg '${output}/python/bin/python3'`,
    '125 /different/.build/backend/python/bin/python3 serve',
    `126 "${output}/python/bin/python3" -I -B launcher serve`,
  ].join('\n')), [123, 126]);
  assert.deepEqual(backendProcesses(output, ''), []);
});
