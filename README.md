# Dextana

A single-owner, local-first desktop work assistant built with Electron, React, Ollama, and Harnest. Dextana does work in isolated in-app browsers, delegates independent assignments to other agents, and optionally connects to Fused MCP operations.

## Run from source

Requirements: **Node.js 24 LTS** (22.12 or newer also supported), **Harnest 0.16.0**, and a running **Ollama** server. Harnest must be available on `PATH`. Harnest manages the agent's Python environment.

```sh
npm ci
harnest env sync agent --profile runtime
npm start
```

Open **Settings** from the bottom of the chats panel or the app-name menu (⌘, on macOS; Ctrl+, elsewhere), connect to your Ollama address, select a default chat model, and save. Choose a model with tool-calling support for browser and integration work. Embedding-only models cannot run activities. The model selector can also change the model for a new activity or a follow-up message.

Ollama normally runs at `http://127.0.0.1:11434`. Remote addresses require HTTPS. Cloud models configured through Ollama also work; those models send inference requests to their provider. Dextana does not require an OpenAI account or API key.

## Workflows

- Start an activity with a concrete assignment. Enter sends; Shift+Enter adds a line. Cmd/Ctrl+N starts a new activity.
- Keep up to eight activities running concurrently, each with its own Harnest session and model selection.
- Browser tools open an embedded browser pane automatically for the selected activity. A green Dextana cursor shows the element the agent is about to interact with. Background browsers remain isolated and do not steal the foreground pane. The tab bar shows pages from all chats and delegated workers, labelled with their owner. Select a tab to watch it without changing the agent’s target. Use **+** to open another page for the tab’s chat or **×** to close an idle tab. Agents can open, list, target, and close their own tabs; each activity supports up to 12. Tabs within one chat share storage, while different workers stay isolated.
- Ask the agent to delegate independent assignments. It can start up to three workers per delegation, with at most two levels of delegation. Each worker appears as a separate activity and can use its own owner-selected model. Stopping the parent also stops its workers.
- Stop an activity without stopping unrelated work. Stopping prevents further desktop actions; it does not undo a browser submission or remote operation already sent.

Example assignments:

```text
Open https://example.com and summarize what is on the page.

Use two workers: have one draft a launch checklist and the other identify
the questions we need to resolve. Combine their results into a launch plan.
```

## Plan mode

Choose **Plan** in the composer to review Dextana's steps before work starts. Approve the plan once to cover its listed websites, documents, and enabled integration tools for that run and its workers. Decline it or send a follow-up to request changes. Plans and revisions remain in the chat across restarts; execution permission ends when the run finishes or is interrupted. See [Plan mode](docs/plan-mode.md).

## MCP connections and tool permissions

In **Settings → MCP connections**, add a named **Streamable HTTP** server (with an optional bearer token) or a **local stdio** command (arguments as a JSON array and optional environment variables). Saving a connection does not contact it. **Test connection** starts/connects to the server and retrieves its tools and input/output schemas without executing tools. Local commands run with the owner's account permissions; use environment fields for secrets rather than command arguments.

Each discovered tool starts **Disabled**. Choose **Ask every time** or **Allow automatically**, then **Save tool permissions**. The agent's `mcp` tool lists only enabled tools and connections. “Ask every time” uses Harnest's `request_human_approval` for the exact evaluated call and overrides chat-wide auto-allow. These per-tool policies apply across chats and persist across restarts. Browser and Fused chat permissions continue to work separately.

Changed or newly discovered tools reset to disabled when retested. Execution also checks the live schema before sending a tool call; a changed schema or connection/policy revision invalidates an earlier prepared action. MCP failures are not automatically retried. Bearer tokens and stdio environment values are encrypted with the system keyring and are not included in model prompts or saved transcript JSON. Edit, disable, retest, or remove connections from Settings. Remote connections require HTTPS; legacy SSE and OAuth login flows are not currently supported.

## Optional Fused connection

Create and manage physical or Unified operations in your own Fused Engine using Fused's tooling. Dextana connects to an existing Engine-hosted MCP version; it does not provision or modify the Engine.

In Settings, enable Fused and supply its **Streamable HTTP MCP URL** and **MCP execution token**. A fixed token scoped to this owner's connected resources is appropriate for this single-owner app. Dextana supports the `search_docs` and `execute` tools and can retrieve their exact schemas with `list`.

Each activity gets a separate MCP client/session. The execution token is encrypted with Electron `safeStorage` and never sent to the renderer after saving or included in model prompts. Provider credentials remain in Fused. Linux requires a working system keyring; plaintext token storage is refused. Remote MCP endpoints require HTTPS and redirects are refused.

The agent discovers operation schemas before execution. Every browser or Fused action, including discovery, displays its arguments for permission before contacting the browser or MCP client. Choose **Allow action**, **Deny action**, or check **Auto-allow … actions in this chat** before allowing. Browser and MCP permissions are separate and saved with that chat; new chats and delegated workers ask independently. Use **Ask next time** on the in-chat automatic-access confirmation to turn auto-allow off. Denial stops the current turn. Dextana does not automatically replay failed or uncertain executions.

## Tests

```sh
npm test                    # TypeScript unit tests
npm run test:e2e            # Build and launch actual Electron + Harnest
harnest test agent          # Harnest compiler and authored Python tests
npm run check              # Unit tests, typecheck, build, desktop E2E
```

The desktop tests launch the real Electron app and the real Harnest ADK runtime. Local HTTP fixtures implement Ollama inference, a browser form, and Fused MCP. Only external providers are substituted: the renderer, IPC, main-process services, Harnest execution, continuation protocol, and browser interactions are real. No downloaded model, live provider credential, or paid model call is required.

E2E coverage includes model discovery and restart persistence, concurrent models, conversation context, cancellation, browser form submission, automatic embedding and cursor display, browser-session isolation, parallel worker delegation, Fused discovery/approval/exactly-once execution, and owner authentication. Compatible desktop tests share one temporary Electron/Harnest workspace per worker and create separate chats. Explicit restart checks reopen that workspace. First-run settings, standalone authentication, and renderer-only checks run in the `isolated` project. Failed runs keep per-test Playwright traces under `test-results/`, including both sides of a restart.

Run `npm run test:e2e -- --project=desktop` for the shared desktop flows, or `--project=isolated` for the independent checks. Individual spec files and `--grep` still work. The shared fixture resets provider responders and call logs between tests, releases pending work, and restores the window size and composer. Tests that change app-wide settings must restore them. Desktop process IDs and workspace paths appear in test report annotations so reuse is verifiable.

**Development rule:** write the full E2E flow for every testable feature before moving to the next feature, then run it through the actual app. Do not replace app behavior with test-only IPC shortcuts or bypass the Harnest runtime.

## Use an existing website login

When a website shows a sign-in form, a compact **Use login from my browser** popup appears over the page. Dismiss it to sign in directly, or use the key icon in the browser header to open the transfer manually. The small Chrome extension lets you approve transferring cookies, local storage, and session storage from your signed-in tab. Dextana reloads the destination tab with the selected state; matching keys are replaced. It adds no login expiry or access timers. Direct sign-in remains available.

The extension ships with Dextana. Choose **Need the extension? → Open extension folder** in the login dialog, then load that folder through Chrome's Developer mode. Use **Copy connection code** to connect it. The extension can open the requested site, or—with explicit approval—use a signed-in site such as Gmail when the destination is on a separate login domain. See [setup and transfer details](docs/browser-login-transfer.md).

## Packaging

`npm run pack` builds the native app; `npm run dist` creates installers. End users need neither Harnest nor Python. CI builds and tests native macOS, Windows, and Linux packages with the pinned build-only compiler. See [packaging and CI](docs/packaging.md).

## Data and boundaries

The app stores settings, transcripts, and action receipts in `state.json` inside Electron's per-user application-data directory (`~/Library/Application Support/dextana` on macOS). The Fused token is in a separate encrypted file. `DEXTANA_USER_DATA` selects a different workspace for tests or development.

Harnest uses its managed ADK mode and native `ollama_chat` provider. The desktop starts the compiled backend on loopback with a random owner token, using its bundled private Python runtime. Only the trusted top-level renderer has the narrowly scoped preload API. Embedded pages have Chromium sandboxing, no Node.js, no preload bridge, separate persistent browser storage for each chat, denied device permissions, blocked downloads, and blocked popups. Browser tools accept fixed actions and observed element references, not arbitrary model-authored JavaScript.

Chats save all their browser tabs, including pages you navigate to yourself. Closed tabs remain closed after restart. After restarting Dextana, select the chat and click **Reopen browser** to restore a page, then select other saved tabs to reopen them. Each chat retains its own persistent cookies and local storage; sites may still require you to sign in again. Unsent forms and page history are not restored. Reopening loads the saved address without replaying previous clicks or submissions. Pages load only when you reopen them or approve a new browser action.

Browser isolation is Chromium process/session isolation, **not a VM or container**. Pages can access normal HTTP(S) network destinations, including local/intranet sites. Browser contents and tool results remain untrusted model input. Review sensitive work and use appropriately scoped Fused operations.

## Current limits

- Native alpha installers include the compiled backend and private Python runtime. Code signing, notarization, and auto-updates are not yet configured. See [packaging and CI](docs/packaging.md).
- Browser automation supports top-level page navigation, reading, filling, and clicking. Iframes, file uploads/downloads, and OS computer-use are not implemented.
- Harnest's execution/checkpoint store is process-local. Desktop transcripts and action receipts persist. After restart, a follow-up starts a new Harnest session with the saved conversation as historical context; suspended executions and browser logins are not resumed or replayed.
- Thinking is shown when the selected Ollama model emits it. It streams in an expanded grey panel, then collapses into “Thought for …” when the answer arrives. Text and thinking continue streaming after desktop tool actions; saved thoughts can be reopened after restart.
- The desktop enforces eight active runs, a five-minute run deadline, forty desktop actions per run, and bounded delegation. Actual parallel model inference depends on Ollama's configuration and available memory.
- Fused operation authoring and dynamic connected-user selector configuration stay in Fused's tools for now.

See [architecture](docs/architecture.md) for code boundaries and extension points. Licensed under the [Dextana No-Resale License](LICENSE). Personal and business use are allowed; selling or repackaging Dextana for resale requires written permission from [Fused](https://usefused.com). Previously distributed MIT copies retain their original rights.

### Work documents and chat context

Use **Files** beside the message composer to select Excel (`.xlsx`), CSV, or UTF-8 text/Markdown (`.txt`, `.md`) documents. Selecting a file shares its path, not its contents. Ask Dextana to read it; the desktop displays a permission request before the file is opened. The selected Ollama model receives the approved contents (including when you choose an Ollama cloud model).

Ask for a budget workbook, contact table, meeting notes, or another work deliverable. Creation shows the destination and a document/table preview before saving. A simple filename saves in **Documents/Dextana**; an absolute path can target an existing folder. Existing files are never overwritten. Use **Show in folder** in the top-right **Context** box to find the result.

Reads and creation have independent **Allow action**, **Deny action**, and chat-scoped **Auto-allow** choices. Revoke automatic access with **Ask next time** on its in-chat confirmation. Ordinary chat permissions do not transfer to other chats or delegated workers; an explicitly approved plan shares only its listed resources with its workers for that run. Cancelling or denying a pending request prevents that action.

The Context box groups references into **Files** and **Links**, both collapsed by default with item counts. It records up to 100 recent file/link references for the selected chat, distinguishing selected-but-unread files, read documents, created documents, referenced URLs, and visited pages. These references survive restart; they are not a claim that a complete document remains in the model's token window. Opening a link from the box uses your default browser. The agent's browser actions remain permission-gated and use Dextana's embedded browser.

This workflow is for documents and tables: no terminal, project tree, code editor, source-file editing, macros, or formula execution. Excel outputs use formatted headers, frozen header rows, and table filters; formulas in existing workbooks return cached values without recalculation. Supported limits: 5 MB input files, 20 MB expanded workbook data, 20 sheets, 100 columns, 10,000 cells, and 500,000 text characters. CSV creation accepts one structured table and escapes formula-like text. Word/PDF and other file types are not supported yet.
