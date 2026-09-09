import type { Desktop } from '../../tests/e2e/fixture';
import type { Activity } from '../../src/shared/types';
import type { browserFixture } from '../../tests/helpers/user-browser';
async function approve(
  work: Desktop,
  state: Activity,
  seed: boolean,
  approvals: string[],
  origin: string,
) {
  if (!state.approval) return;
  if (state.approval.capability !== 'browser')
    throw new Error(`Unexpected approval: ${state.approval.capability}`);
  const details = JSON.parse(state.approval.arguments);
  if (details.url && new URL(details.url).origin !== origin)
    throw new Error('Eval permits navigation only to its local synthetic inbox');
  if (!seed && details.browser === 'in-app')
    throw new Error('Attempted in-app execution after external-browser request');
  approvals.push(state.approval.arguments);
  await work.page.evaluate(
    async ({ activityId, approvalId }) =>
      window.dextana.approve({ activityId, approvalId, approved: true }),
    { activityId: state.id, approvalId: state.approval.id },
  );
}
export async function drive(
  work: Desktop,
  browser: Awaited<ReturnType<typeof browserFixture>>,
  id: string,
  empty: boolean,
  seed = false,
) {
  const deadline = Date.now() + 130_000;
  let attached = false;
  const approvals: string[] = [];
  while (Date.now() < deadline) {
    const state = await work.page.evaluate(
      async (id) => (await window.dextana.snapshot()).activities.find((item) => item.id === id)!,
      id,
    );
    await approve(work, state, seed, approvals, browser.origin);
    const code = work.page.getByLabel('Browser control connection code');
    if (!attached && (await code.isVisible())) {
      await browser.attach(await code.inputValue(), empty ? [] : 'browser');
      attached = true;
    }
    if (['completed', 'failed', 'cancelled', 'interrupted', 'awaiting_plan'].includes(state.status))
      return { state, attached, approvals };
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Evaluation deadline exceeded');
}
