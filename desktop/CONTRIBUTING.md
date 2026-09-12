# Contributing

Use Node.js 24 and Harnest 0.18.0. Run the setup and checks in the README.

For each testable feature, write its complete Electron E2E flow before starting the next feature. Tests must use the real app, IPC, and Harnest runtime; substitute external providers at their network boundary. Use temporary user-data directories and synthetic credentials. Never run tests against the owner's open workspace.

Compatible desktop specs import `test` from `tests/e2e/fixture.ts` and request its `workspace` fixture. `await workspace(responder)` reuses the worker's app with a test-local Ollama responder and call log; `start()` opens a new chat. `work.close()` releases the test's pending work, while worker teardown closes Electron. Use unique chat titles and scope browser assertions to the current fixture URL. Restore global settings/cookies changed by the test. Keep intentional persistence checks using `work.restart()`; the fixture refreshes its page reference and captures a trace for each app process. First-run, standalone-runtime, and renderer-only tests belong in the `isolated` Playwright project. Do not make one test depend on another test's chats or results; each spec must also pass alone.

Keep the renderer free of Node.js and remote credentials. Keep untrusted browser pages in isolated `WebContentsView` instances. Validate renderer inputs and model tool arguments in the main process. Do not automatically replay operations after an uncertain result.

Use the shared components in `src/renderer/ui` and semantic `--dx-*` tokens for new renderer pages and general-purpose controls. Keep page CSS focused on layout. Review the developer examples in `src/renderer/DesignLanguage.tsx` and [the design language guide](docs/design-language.md) for component usage, accessibility, and migration guidance.

Harnest authoring is managed ADK. Capabilities belong in their convention-based folders under `agent/`; shared helpers belong in `agent/lib`, and Pydantic contracts in `agent/models`. Do not edit generated `.harnest` files. Use `harnest skills show` for the installed release's authoring guidance.

Run Harnest environment operations sequentially. When compiling the production profile while the desktop is running, use a separate source copy so environment synchronization cannot interfere with the running development profile.
