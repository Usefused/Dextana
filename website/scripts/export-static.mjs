import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequestHandler } from '@remix-run/node';
import * as build from '../build/server/index.js';

// The presentation-only site can also be hosted as prerendered static output.
const handler = createRequestHandler(build, 'production');
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('build/client', 'dist', { recursive: true });
for (const [route, file, expectedStatus] of [['/', 'index.html', 200], ['/not-found', '404.html', 404]]) {
  const response = await handler(new Request(`http://localhost${route}`));
  if (response.status !== expectedStatus) throw new Error(`Export ${route} returned ${response.status}`);
  await writeFile(`dist/${file}`, await response.text());
}
console.log('Exported the home page and 404 page to dist/.');
