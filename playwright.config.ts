import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  timeout: 30_000,
  use: { trace: 'retain-on-failure' },
  // Keep tests with the same worker fixture together so Electron remains alive
  // across spec files. Cold-start and renderer-only checks use their own workers.
  projects: [
    {
      name: 'desktop',
      testIgnore: ['**/settings.spec.ts', '**/security.spec.ts', '**/scrolling.spec.ts'],
    },
    {
      name: 'isolated',
      testMatch: ['**/settings.spec.ts', '**/security.spec.ts', '**/scrolling.spec.ts'],
    },
  ],
});
