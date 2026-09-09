import type { Locator } from '@playwright/test';

export async function expandConnector(region: Locator) {
  const summary = region.getByRole('button', { name: / details$/ });
  if (await summary.getAttribute('aria-expanded') !== 'true') await summary.click();
}
