import { build } from 'esbuild';
await build({
  entryPoints: ['src/shared/browser-semantics.ts'],
  outfile: 'browser-extension/page-semantics.js',
  bundle: true,
  platform: 'browser',
  format: 'iife',
  globalName: 'DextanaPage',
  banner: { js: '// Generated from src/shared/browser-semantics.ts.' },
});
await build({
  entryPoints: ['src/extension/login-scope.ts'],
  outfile: 'browser-extension/site-scope.js',
  bundle: true,
  platform: 'browser',
  format: 'iife',
  globalName: 'DextanaSites',
  minify: true,
  banner: {
    js: '// Generated from src/extension/login-scope.ts. Includes tldts (MIT); see site-scope.LICENSE.',
  },
});
await build({
  entryPoints: ['src/main/main.ts'],
  outfile: 'dist/main.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron', 'mammoth', 'pdfjs-dist/*', '@trycua/cua-driver', '@trycua/cua-driver/*'],
});
await build({
  entryPoints: ['src/main/preload.ts'],
  outfile: 'dist/preload.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
});
