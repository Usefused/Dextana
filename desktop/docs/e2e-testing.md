# Desktop E2E structure

Compatible feature tests share one temporary Electron app and compiled Harnest backend per Playwright worker. Each flow creates separate chats. The owner’s running app and profile are not used. External Ollama and integration services use local test servers; application code, IPC, approvals, browser operations, and agent execution are real.

## Grouped recovery

`recovery.spec.ts` owns three self-contained recovery journeys:

| Journey              | Scenarios                                                                                                                         | Desktop restarts |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Saved chat state     | Conversation/model history, A2UI cards, readable results, thoughts, archives, folders, document context/migration, scheduled jobs | 1                |
| Browser recovery     | Action permissions, tab ownership/restoration, cookies/local storage, failed reopening, closed-tab persistence                    | 2                |
| Integration recovery | MCP connection/tool policies, all four authentication modes, and isolated Fused routing/credentials                                                               | 1                |

Plan mode retains its own two-restart flow: approve a pending plan after restart, then verify completed-plan history and expired execution permission after another restart. This brings explicit shared-desktop restarts from 16 to 6. First-run settings keeps a separate restart, and packaged-app tests remain independent.

The original feature assertions live in `scenarios/` as async generators. A plain `yield` marks a restart boundary; it does not reset or mock app state. The runner advances each scenario sequentially to that boundary, restarts the actual app once, and resumes each scenario. A later yield requires another real restart. Every phase appears as a named Playwright step. Each group arranges all of its own test data; it does not depend on another test having run first.

Local test servers and expected values stay alive across a boundary. Provider call logs and responders are scenario-specific. Before another scenario takes over, the runner waits until no desktop activity is starting or running. The renderer returns to a blank chat between phases. Full traces include each side of the shared restart, and report annotations record the actual restart count.

For legacy-data migration tests, `yield async () => { ... }` supplies an on-disk migration setup that runs after Electron closes and before it reopens. This prevents another scenario's normal save from overwriting the legacy fixture. This mechanism is only for constructing old-version fixtures; ordinary flows still write through the app.

## Running focused checks

```sh
npm run test:e2e
npm run test:e2e -- tests/e2e/recovery.spec.ts
npm run test:e2e -- tests/e2e/recovery.spec.ts --grep 'saved chat'
npm run test:e2e -- tests/e2e/recovery.spec.ts --grep 'browser recovery'
npm run test:e2e -- tests/e2e/plan.spec.ts
npm run test:e2e -- --project=isolated
npm run test:packaged
```

`isolated` contains first-run settings, compiled-backend authentication, and renderer-only checks. Authentication launches the same `.build/backend` artifact used by the desktop with its private Python and a stripped PATH; it no longer starts the Harnest CLI. The actual Chrome extension tests retain their independent Chrome profiles because transfer must cross a genuine browser/profile boundary.

Appearance coverage shares the first-run settings restart: change themes before Ollama setup, verify live System changes and explicit overrides, then confirm persistence. `appearance.spec.ts` uses the shared desktop with separate chats to check dark messages, tables, inputs, approvals and browser controls; it captures screenshots and verifies embedded websites retain their authored colors. It restores System before releasing the workspace.

## Adding coverage

Write the full E2E flow before implementing the next feature. Add ordinary behavior tests using the shared `workspace` fixture. Put compatible restart assertions into the relevant recovery journey, retaining separate chats and named steps. Keep special interruption, replay, or first-run conditions separate when sharing would change their meaning. Do not replace a production action or approval with a test-only IPC shortcut.

Restore global settings or remove connections/jobs created by a flow. Test failure must cancel unfinished work and close local servers; temporary-profile deletion has bounded retries for shutdown writes. A failed Playwright worker is replaced normally, so no later test may depend on its memory or profile.
