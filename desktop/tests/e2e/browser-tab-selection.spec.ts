import { test, expect } from '@playwright/test';
import { UserBrowser } from '../../src/main/user-browser';
import { browserFixture } from '../helpers/user-browser';

for (const total of [3, 13]) {
  test(`bulk selection grants only checked tabs from ${total} available tabs`, async () => {
    const fixture = await browserFixture();
    const browser = new UserBrowser(`chrome-extension://${fixture.id}`, () => {});
    const selected = Math.min(total, 12);
    try {
      for (let index = 1; index < total; index++) {
        const page = await fixture.context.newPage();
        await page.goto(`${fixture.origin}/tab-${index}`);
      }
      const pairing = await browser.begin('selection', 'Select browser tabs');
      await fixture.popup.locator('#code').fill(pairing.code);
      await fixture.popup.locator('#connect').click();
      await fixture.popup.locator('#control-granular').check();
      const all = fixture.popup.getByRole('button', {
        name: total > 12 ? 'Select first 12' : 'Select all',
        exact: true,
      });
      const checked = fixture.popup.locator('#control-tabs input:checked');
      const approve = fixture.popup.locator('#control-approve');
      await all.click();
      await expect(checked).toHaveCount(selected);
      await expect(fixture.popup.locator('#control-selection-count')).toHaveText(
        `${selected} of ${total} selected · 12 maximum`,
      );
      if (total > 12) {
        await fixture.popup.locator('#control-tabs input').last().check();
        await expect(approve).toBeDisabled();
      }
      await fixture.popup.getByRole('button', { name: 'Deselect all', exact: true }).click();
      await expect(checked).toHaveCount(0);
      await expect(approve).toBeEnabled();
      await all.click();
      await fixture.popup.locator('#control-tabs input').first().uncheck();
      const expected = await fixture.popup
        .locator('#control-tabs label')
        .evaluateAll((rows) =>
          rows
            .filter((row) => row.querySelector('input')!.checked)
            .map((row) => row.getAttribute('title')),
        );
      await approve.click();
      await expect(fixture.popup.locator('#control-stop')).toBeVisible();
      await expect(fixture.popup.locator('#control-selection')).toBeHidden();
      expect(
        browser
          .snapshot()[0]
          .tabs.map((tab) => tab.url)
          .sort(),
      ).toEqual(expected.sort());
      expect(browser.snapshot()[0].tabs).toHaveLength(selected - 1);
    } finally {
      browser.stop('selection');
      await fixture.close();
    }
  });
}
