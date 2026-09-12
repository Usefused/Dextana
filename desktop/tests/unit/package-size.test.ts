import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const builder = readFileSync(resolve(root, 'electron-builder.yml'), 'utf8');

describe('desktop package size boundaries', () => {
  test('ships only modules that remain external to the compiled application', () => {
    expect(Object.keys(pkg.dependencies).sort()).toEqual([
      '@trycua/cua-driver',
      'mammoth',
      'pdfjs-dist',
    ]);
    for (const bundled of [
      '@modelcontextprotocol/sdk',
      'adm-zip',
      'exceljs',
      'mermaid',
      'react',
      'react-dom',
      'react-markdown',
      'remark-gfm',
      'tldts',
    ]) {
      expect(pkg.devDependencies[bundled]).toBeTruthy();
    }
  });

  test('keeps one application language and excludes unused PDF.js distributions', () => {
    expect(builder).toContain('electronLanguages: [en-US, en-GB]');
    expect(builder).toContain('!node_modules/pdfjs-dist/build/**');
    expect(builder).toContain('!node_modules/pdfjs-dist/legacy/build/*.map');
  });
});
