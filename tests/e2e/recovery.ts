import { expect, type TestInfo } from '@playwright/test';
import { test, type Desktop, type Responder } from './fixture';

export type BeforeLaunch = () => Promise<void>;
export type RecoveryWorkspace = (responder?: Responder) => Promise<Omit<Desktop, 'restart'>>;
export type RecoveryScenario = (
  workspace: RecoveryWorkspace,
  info: TestInfo,
) => AsyncGenerator<void | BeforeLaunch, void, void>;

/** Run each feature up to its restart boundary, restart once, then verify each chat.
 * Generators retain live test servers and local expectations, not app state.
 * Every group creates its own chats; no test depends on a previous test's data.
 */
export async function recoverTogether(
  work: Desktop,
  info: TestInfo,
  scenarios: Record<string, RecoveryScenario>,
) {
  const entries = Object.entries(scenarios).map(([name, scenario]) => {
    let respond: Responder | undefined;
    let opened = false;
    const calls: any[] = [];
    const workspace: RecoveryWorkspace = async (responder) => {
      if (opened) throw new Error('Use one workspace per recovery scenario.');
      opened = true;
      respond = responder;
      activate();
      return {
        ...work,
        get page() {
          return work.page;
        },
        calls,
        close: async () => {},
      };
    };
    const activate = () =>
      work.setResponder((body, response) => {
        calls.push(body);
        return respond?.(body, response) ?? false;
      });
    return { name, activate, iterator: scenario(workspace, info), done: false };
  });
  let restarts = 0;
  try {
    while (entries.some((entry) => !entry.done)) {
      const beforeLaunch: BeforeLaunch[] = [];
      for (const entry of entries.filter((entry) => !entry.done)) {
        entry.activate();
        await work.resetView();
        await test.step(`${entry.name} · ${restarts ? `after restart ${restarts}` : 'before restart'}`, async () => {
          const result = await entry.iterator.next();
          entry.done = result.done === true;
          if (!result.done && result.value) beforeLaunch.push(result.value);
          // Switching responders or restarting while work is active would hide races.
          await expect
            .poll(
              async () =>
                (await work.page.evaluate(() => window.dextana.snapshot())).activities
                  .filter((activity) => ['starting', 'running'].includes(activity.status))
                  .map((activity) => activity.title),
              { timeout: 60_000 },
            )
            .toEqual([]);
        });
      }
      if (entries.every((entry) => entry.done)) break;
      if (++restarts > 3) throw new Error('Recovery scenarios exceeded three restart boundaries.');
      await test.step(`Shared restart ${restarts}`, () =>
        work.restart(async () => {
          for (const prepare of beforeLaunch) await prepare();
        }));
    }
  } finally {
    // Cancel unfinished test work before closing its local servers on failure.
    await work.close();
    for (const entry of entries) await entry.iterator.return();
    info.annotations.push({ type: 'shared-restarts', description: String(restarts) });
  }
}
