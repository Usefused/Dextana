# Homepage claims audit — 9 September 2026

Reviewed every homepage section against the current implementation. This is a source-backed copy audit, not a fresh live test of every model, website, or integration.

| Section | Finding and correction | Evidence |
| --- | --- | --- |
| Brand, hero, metadata | Remove the naming lesson; use Dext naturally. Lead with browser, files, connected apps and getting work done. Retain Dextana by Fused and searchable aliases. | `website/app/Brand.tsx`, `agent/tools/browser.py`, `files.py`, `mcp.py` |
| Hero example | CRM example is explicitly illustrative and asks for review before writing. No change needed to that promise. | `src/main/local-capabilities.ts`, `website/app/routes/_index.tsx` |
| Principles | Local-first, open-weight models, browser and OpenAPI via Fused are supported. Local-first does not mean offline. | `agent/lib/ollama.py`, `src/main/runtime.ts`, `mcp.ts` |
| Example tasks | Documents were undersold. Add PDF/Word inputs and practical deliverables. Preserve parallel work with separate browser sessions. | `agent/tools/files.py`, `delegate.py`, `src/main/files.ts` |
| Context | Missing PDF, Word and image support. Fresh approval on every read was overstated. Explain file references and action/chat/plan permissions. | `src/main/files.ts`, `local-capabilities.ts`, `agent/lib/activities.py` |
| Model choice | Ollama is not mandatory. Explain Ollama and OpenAI-compatible providers, including OpenRouter, and model tool/vision requirements. | `src/main/settings.ts`, `src/renderer/main.tsx`, `agent/lib/ollama.py`, `tests/e2e/openai-models.spec.ts` |
| Privacy | Local inference is available, not universal. File references also enter model context. Explain local storage, chosen model endpoint and connected-service traffic. | `agent/lib/activities.py`, `ollama.py`, `src/main/runtime.ts` |
| Approvals | Plans, chat grants and tool policies can cover actions. Remove language implying a fresh prompt for every action. | `src/main/plans.ts`, `local-capabilities.ts`, `mcp.ts` |
| Integrations | OpenAPI needs authentication/configuration. Explain native Fused workspace sign-in, connection testing and tool discovery; retain direct remote/local MCP support. | `src/main/fused-cli.ts`, `mcp.ts`, `src/renderer/FusedWorkspace.tsx` |
| Browser | “Top-level pages” was false. Include JavaScript, tabs, embedded frames, keyboard input, hover, scrolling, dialogs and screenshots. Retain login/site limitations. | `agent/tools/browser.py`, `src/main/browser-inspection.ts`, `browser.ts`, browser regression specs |
| Getting started | Offer both model connection paths. Mention immediate, parallel and scheduled work. Bundled installers include the runtime. | `src/renderer/main.tsx`, `agent/tools/delegate.py`, `schedule.py`, `docs/packaging.md` |
| Scheduling | Reminders and one-time/recurring tasks were missing. Add FAQ with open-app/awake-computer requirement and missed-run behavior. | `agent/tools/schedule.py`, `agent/lib/scheduler.py`, `docs/scheduled-jobs.md` |
| Downloads | Artifacts are valid but predate several current features. They open GitHub package pages, not anonymous direct binary endpoints. Add an explicit current-source versus packaged-alpha distinction and a source link. | GitHub artifact/run APIs, `website/app/content.ts` |
| Signing/licence | “Unsigned” conflated checksum/ad-hoc signing with native publisher trust. Say not Apple-notarized or Windows verified-publisher releases. No-resale summary matches the licence. | `docs/packaging.md`, `electron-builder.adhoc.cjs`, `LICENSE` |
| Audience/limits | Single-owner app, not shared team collaboration. Distinguish reading from creation: no PDF/Word creation, formula/macro execution, general desktop-app control or browser file transfer. | `agent/instructions.md`, `agent/tools/files.py`, `src/main/files.ts`, `browser.ts` |
| Footer/fallback/accessibility | Ownership and private repository/docs/licence links remain valid. Fused stays clickable. Existing fallback page and platform dropdown remain. | `website/app/root.tsx`, `Brand.tsx`, `_index.tsx` |

## Installer evidence

Run `34288516486` is the latest successful **Package Dextana** run in the inspected history. Newer runs are source checks. All three artifacts are unexpired and come from `0440ad31e98c6c443cae7a7bf73c1206eca7170c`, before current model/browser/scheduler changes:

| Platform | Artifact | Bytes | Expiry UTC |
| --- | --- | ---: | --- |
| macOS ARM64 | 10080613868 | 506386990 | 2026-09-22 23:05:43 |
| Windows x64 | 10080783730 | 469952472 | 2026-09-22 23:11:40 |
| Linux x64 | 10080532414 | 279939839 | 2026-09-22 23:03:00 |

Rebuilding/publishing current installers is separate release work. Do not imply those packages include every current capability. Displayed archive sizes use rounded decimal MB.
