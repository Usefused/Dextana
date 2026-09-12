import { expect } from '@playwright/test';
import { test, start, type Desktop } from '../../tests/e2e/fixture';
import { browserFixture } from '../../tests/helpers/user-browser';
import { cases, inbox } from './cases';
import { liveModelProxy } from './model-proxy';
import { drive } from './driver';
import { createReport, persistReport } from './report';
const model = process.env.DEXTANA_EVAL_MODEL || 'qwen3.5:cloud';
const base = process.env.DEXTANA_EVAL_BASE_URL || 'http://127.0.0.1:11434';
const repeats = Number(process.env.DEXTANA_EVAL_REPEATS || 2);
const selected = cases.filter(
  (item) => !process.env.DEXTANA_EVAL_CASE || item.id === process.env.DEXTANA_EVAL_CASE,
);
async function configure(work: Desktop, url: string) {
  await work.page.getByRole('button', { name: 'Settings', exact: true }).click();
  await work.page.getByLabel('Ollama address').fill(url);
  await work.page.getByRole('button', { name: 'Connect to Ollama' }).click();
  await expect(work.page.getByText(/models available/)).toBeVisible();
  await work.page.getByRole('button', { name: 'Save settings' }).click();
  await expect(work.page.getByRole('button', { name: 'Save settings' })).toBeHidden();
  await expect(work.page.getByRole('button', { name: 'New activity', exact: true })).toBeVisible();
}
async function current(work: Desktop, previous: string[]) {
  await expect
    .poll(async () =>
      work.page.evaluate(
        async (previous) =>
          (await window.dextana.snapshot()).activities.filter((item) => !previous.includes(item.id))
            .length,
        previous,
      ),
    )
    .toBeGreaterThan(0);
  return work.page.evaluate(async (previous) => {
    const snapshot = await window.dextana.snapshot();
    return snapshot.activities.find((item) => !previous.includes(item.id))!;
  }, previous);
}
for (const testCase of selected)
  for (let repetition = 1; repetition <= repeats; repetition++) {
    test(`${testCase.id} sample ${repetition}`, async ({ workspace }) => {
      const proxy = await liveModelProxy(base);
      const browser = await browserFixture({ html: inbox, offline: true });
      const scenario = {
        ...testCase,
        prompt: testCase.prompt.replace('{inboxUrl}', browser.origin + '/inbox'),
      };
      const work = await workspace();
      const started = new Date().toISOString();
      let result: Awaited<ReturnType<typeof drive>> | undefined;
      let failure = '';
      let id = '';
      let offset = 0;
      await browser.page.goto(browser.origin + '/inbox');
      try {
        await configure(work, proxy.url);
        const previous = await work.page.evaluate(async () =>
          (await window.dextana.snapshot()).activities.map((item) => item.id),
        );
        if (scenario.seed) {
          await start(
            work.page,
            `Open this page in the in-app browser: ${browser.origin}/marketing. Report its title.`,
            model,
          );
          id = (await current(work, previous)).id;
          const seedResult = await drive(work, browser, id, false, true);
          if (seedResult.state.status !== 'completed')
            throw new Error(`Seed failed: ${seedResult.state.error}`);
          offset = proxy.trace.calls.length;
          await work.page.getByLabel('Describe your work').fill(scenario.prompt);
          await work.page.getByRole('button', { name: 'Send message', exact: true }).click();
          await expect
            .poll(() =>
              work.page.evaluate(
                async ({ id, prompt }) =>
                  (await window.dextana.snapshot()).activities
                    .find((item) => item.id === id)
                    ?.messages.some(
                      (message) => message.role === 'user' && message.content === prompt,
                    ),
                { id, prompt: scenario.prompt },
              ),
            )
            .toBe(true);
        } else {
          await start(work.page, scenario.prompt, model);
          id = (await current(work, previous)).id;
        }
        result = await drive(work, browser, id, scenario.empty);
      } catch (error) {
        failure = String(error);
      }
      const report = createReport(
        scenario,
        repetition,
        started,
        model,
        proxy.trace,
        offset,
        result,
        failure,
      );
      await persistReport(report);
      console.log(
        JSON.stringify({
          scenario: report.scenario,
          repetition,
          directExternalChoice: report.directExternalChoice,
          connected: report.connected,
          completed: report.completed,
          subjectVerified: report.subjectVerified,
          firstBrowserAction: report.firstBrowserAction,
          failure,
          runtimeError: report.runtimeError,
        }),
      );
      if (id) {
        await work.page.evaluate((id) => window.dextana.cancel(id), id).catch(() => {});
        await work.page.evaluate((id) => window.dextana.stopUserBrowser(id), id).catch(() => {});
      }
      await work.close();
      await browser.close();
      proxy.close();
      expect(failure).toBe('');
      expect(report.connected).toBe(true);
      expect(report.completed).toBe(true);
      if (scenario.id === 'autonomous_tab' || scenario.id === 'explicit_correction')
        expect(report.subjectVerified).toBe(true);
    });
  }
