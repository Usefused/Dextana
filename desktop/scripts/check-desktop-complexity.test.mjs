import assert from 'node:assert/strict';
import { test } from 'node:test';
import { complexities } from './check-desktop-complexity.mjs';

test('counts decisions, optional access, defaults, and logical assignment in TSX', () => {
  const source = `function Component({ enabled = false }) {
    if (enabled && ready) for (const item of items) consume(item);
    try { value ??= config?.value; } catch { recover(); }
    return enabled ? <div>{a || b}</div> : null;
  }`;
  assert.equal(complexities(source, 'fixture.tsx')[0].complexity, 10);
});

test('separates nested functions and counts each non-default switch arm', () => {
  const results = complexities(
    `function outer(value) {
    function inner() { return a && b || c; }
    switch (value) { case 1: break; case 2: break; default: break; }
    return () => x?.();
  }`,
    'fixture.ts',
  );
  assert.deepEqual(
    results.map(({ name, complexity }) => [name, complexity]),
    [
      ['inner', 3],
      ['<callback>', 2],
      ['outer', 3],
    ],
  );
});
