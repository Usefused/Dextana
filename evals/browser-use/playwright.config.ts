import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  workers: 1,
  timeout: 240_000,
  outputDir: '../../.build/eval-results/browser-use/traces',
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
});
