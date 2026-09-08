import { build } from 'esbuild';
await build({
  entryPoints: ['src/main/main.ts'],
  outfile: 'dist/main.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron', 'mammoth', 'pdfjs-dist/*'],
});
await build({
  entryPoints: ['src/main/preload.ts'],
  outfile: 'dist/preload.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
});
