# Dextana

A single-owner, local-first desktop work assistant built with Electron, React, Ollama, and Harnest. Dextana does work in isolated in-app browsers, delegates independent assignments to other agents, and optionally connects to Fused MCP operations.

## Run from source

Requirements: **Node.js 24 LTS** (22.12 or newer also supported), **Harnest 0.18.0**, and either a running **Ollama** server or an **OpenAI-compatible chat API**. Harnest must be available on `PATH`. Harnest manages the agent's Python environment.

The agent backend owns runs, queued messages, steering, delegation, plans and scheduled dispatch. Conversations and checkpoints persist locally in SQLite under the desktop's application-data directory. No separate database server is needed. Completed chats retain their Harnest history after restarting; interrupted actions are not replayed automatically.

Ask the agent to remind you after a delay, at a specific date and time, or on a recurring schedule. The `schedule` tool saves the job and returns its next run time; approving a plan by itself does not schedule anything. Reminders appear in **Scheduled jobs** and post into the original chat, with an in-app notice and a desktop notification where available. Scheduled work starts a new activity and retains normal action approvals. Dextana must be running and awake for on-time alerts. Missed reminders appear overdue on return; missed agent work is skipped. Desktop timers also support pause, resume, snooze and dismiss. See [desktop capabilities](docs/desktop-capabilities.md).

```sh
npm ci
harnest env sync agent --profile runtime --frozen
npm start
```

Close Dex before rebuilding a changed backend. On macOS and Linux, the build refuses
to replace a runtime that is still in use, which prevents compiled-skill version
mismatches. After editing bundled skills, restart through `npm start`.


Open **Settings** from the bottom of the chats panel or the app-name menu (⌘, on macOS; Ctrl+, elsewhere), choose Ollama or OpenAI-compatible, connect to your endpoint, and save. Choose a model with tool-calling support for browser and integration work. Embedding-only models cannot run activities. The model selector can also change the model for a new activity or a follow-up message.

Ollama normally runs at `http://127.0.0.1:11434`. Remote addresses require HTTPS. Cloud models configured through Ollama also work; those models send inference requests to their provider. Local Ollama does not require an OpenAI account or API key.

For OpenRouter and other AI gateways, choose **Settings → Models → Provider → OpenAI-compatible**. Enter the API base URL (for example, `https://openrouter.ai/api/v1`) and API key, then **Fetch models** and save. Both proprietary and open-weight chat models are supported. If discovery is unavailable, add the provider's exact chat model ID manually. Embedding and reranking models identified by metadata or model name are excluded. Endpoints that only return opaque IDs cannot reliably report model capabilities; choose a chat model with tool calling for agent work.

Keys are encrypted with the system keychain and passed to the authenticated backend in memory; they are not stored in chat metadata or plain settings. Leaving the key field blank retains the saved key for the same endpoint. **Remove saved key** clears it for subsequent turns when saved. Changing the base URL never reuses the previous endpoint's key. Existing runs retain their original connection; new turns use the saved connection. Compatible endpoints use their default reasoning behavior; Ollama's reasoning controls remain available.

Settings includes a searchable sidebar for **Appearance**, **Models**, **Usage**, **Skills**, and **Connectors**. Add reusable instructions in Skills or import a `SKILL.md`; changes are available through Harnest's dynamic catalog without rebuilding. Connectors is the home for MCP and Fused connections.

For memory across chats, configure an **Embedding model** in Models and save to test it. A private worker creates summaries and personal memories together using the selected chat model; relevant facts are recalled automatically in later chats. Memory uses the existing local SQLite database. An unsupported embedding model disables memory while chat stays available. See [personal memory](docs/personal-memory.md) for sharing, persistence and component boundaries.

**Usage** shows input, output, and total tokens by model over 7 days, 30 days, or all time. Counts come from Harnest's normalized provider metadata and persist in the backend, including chat, delegated, and scheduled runs. Tracking begins with this feature: missing provider counts and previous history are not estimated. These are recorded usage totals, not billing or account quota limits.

Choose **Settings → Appearance → Color theme** for Light, Dark, or System. Changes apply immediately and persist across restarts, even before connecting Ollama. System follows your device’s appearance automatically.

The header’s **Notifications** bell keeps service alerts in one inbox with unread counts, source links, and persistent read/dismiss controls. Timers, reminders, workflows and background-service errors share the same publishing API; OS alerts are optional. See [App notifications](docs/notifications.md).

## Workflows

- Start an activity with a concrete assignment. Enter sends; Shift+Enter adds a line. Cmd/Ctrl+N starts a new activity.
- Waiting messages have **Edit** and **Delete** controls. Edits preserve their queue position, model settings and attachments. Once a message starts running, use the normal cancel control to stop it; remaining messages stay queued.
- Answer an agent question through its card or the regular chat composer. A composer answer resumes the waiting agent; if several workers need answers, use the relevant card. Closed cards become compact receipts, and the conversation shows whether the agent is waiting for your answer or working.
- Choose **Edit** on your latest message to revise it, then **Save and resend** (Cmd/Ctrl+Enter). Escape cancels. Stop any current run and finish queued messages first. Earlier exchanges and attachments remain; the replaced response is regenerated, and completed actions are not undone. Edits persist after restarting.
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

Connectors appear as compact rows with their name, type, and status. Search the list or click a row to reveal activation, connection testing, editing, removal, and tool permissions.

In **Settings → Connectors**, use **Add** at the top to add a named **Streamable HTTP** server (with an optional bearer token) or a **local stdio** command (arguments as a JSON array and optional environment variables). Saving a connection does not contact it. **Test connection** starts/connects to the server and retrieves its tools and input/output schemas without executing tools. Local commands run with the owner's account permissions; use environment fields for secrets rather than command arguments.

Each discovered tool starts **Disabled**. Choose **Ask every time** or **Allow automatically**, then **Save tool permissions**. The agent's `mcp` tool lists only enabled tools and connections. “Ask every time” uses Harnest's `request_human_approval` for the exact evaluated call and overrides chat-wide auto-allow. These per-tool policies apply across chats and persist across restarts. Browser and Fused chat permissions continue to work separately.

Changed or newly discovered tools reset to disabled when retested. Execution also checks the live schema before sending a tool call; a changed schema or connection/policy revision invalidates an earlier prepared action. MCP failures are not automatically retried. Bearer tokens and stdio environment values are encrypted with the system keyring and are not included in model prompts or saved transcript JSON. Edit, disable, retest, or remove connections from Settings. Remote connections require HTTPS; legacy SSE and OAuth login flows are not currently supported.

## Optional Fused connection

Create and manage physical or Unified operations in your own Fused Engine using Fused's tooling. Dextana connects to an existing Engine-hosted MCP version; it does not provision or modify the Engine.

In Settings → Connectors → Fused, choose **Install for Dextana** to download the verified Fused CLI into Dextana’s own folder. No terminal commands or administrator access are needed. A compatible existing CLI on PATH is detected automatically; **Locate installed CLI** lets you choose one elsewhere. Dextana runs the CLI commands for browser login, server discovery, and scoped execution-token generation. Select an MCP version, enable **Automatically create agent tokens**, and specify the exact allowed operations. Token creation requires an approval showing the scope and 24-hour expiry. A direct call to an enabled tool creates a token when needed and continues the approved action; a valid token is reused in that chat. See [native Fused onboarding](docs/fused-native.md). Existing execution tokens can still be entered through manual setup.

Each activity gets a separate MCP client/session. HTTP connections and execution run in the agent backend; local stdio launches and credential access remain in Electron. Manually supplied tokens are encrypted with Electron `safeStorage`; CLI-generated execution tokens stay in memory. Neither is included in renderer snapshots or model prompts. Provider credentials remain in Fused. Linux requires a working system keyring; plaintext token storage is refused. Remote MCP endpoints require HTTPS and redirects are refused.

The agent discovers operation schemas before execution. Every browser or Fused action, including discovery, displays its arguments for permission before contacting the browser or MCP client. Choose **Allow action**, **Deny action**, or check **Auto-allow … actions in this chat** before allowing. Browser and MCP permissions are separate and saved with that chat; new chats and delegated workers ask independently. Use **Ask next time** on the in-chat automatic-access confirmation to turn auto-allow off. Denial stops the current turn. Dextana does not automatically replay failed or uncertain executions.

## Tests

```sh
npm test                    # TypeScript unit tests
npm run test:e2e            # Build and launch actual Electron + Harnest
npm run test:backend       # Frozen Harnest environment and authored Python tests
npm run check              # Unit tests, typecheck, build, desktop E2E
```

The desktop tests launch the real Electron app and the real Harnest ADK runtime. Local HTTP fixtures implement Ollama inference, a browser form, and Fused MCP. Only external providers are substituted: the renderer, IPC, main-process services, Harnest execution, continuation protocol, and browser interactions are real. No downloaded model, live provider credential, or paid model call is required.

E2E coverage includes model discovery and restart persistence, concurrent models, conversation context, cancellation, browser form submission, automatic embedding and cursor display, browser-session isolation, parallel worker delegation, Fused discovery/approval/exactly-once execution, and owner authentication. Compatible desktop tests share one temporary Electron/Harnest workspace per worker and create separate chats. Saved chat, browser, and integration scenarios share restart boundaries in `recovery.spec.ts`, reducing desktop restarts from 16 to 6 while retaining their feature assertions. Plan recovery keeps its pending/completed-plan boundaries. First-run settings, compiled-backend authentication, and renderer-only checks run in the `isolated` project. Failed runs keep per-test Playwright traces under `test-results/`, including both sides of a restart.

Run `npm run test:e2e -- --project=desktop` for the shared desktop flows, or `--project=isolated` for the independent checks. Use `tests/e2e/recovery.spec.ts --grep 'saved chat'` for a focused recovery journey. The shared fixture resets provider responders and call logs between tests, releases pending work, and restores the window size and composer. Recovery scenarios keep their own provider logs and named test steps. Tests that change app-wide settings must restore them. Desktop process IDs, workspace paths, and shared restart counts appear in report annotations. See [E2E testing](docs/e2e-testing.md) for the coverage groups and contribution guide.

**Development rule:** write the full E2E flow for every testable feature before moving to the next feature, then run it through the actual app. Do not replace app behavior with test-only IPC shortcuts or bypass the Harnest runtime.

## Use an existing website login

When a website shows a sign-in form, a compact **Use login from my browser** popup appears over the page. Dismiss it to sign in directly, or use the key icon in the browser header to open the transfer manually. The small Chrome extension lets you approve transferring cookies, local storage, and session storage from your signed-in tab. Dextana reloads the destination tab with the selected state; matching keys are replaced. It adds no login expiry or access timers. Direct sign-in remains available.

The extension ships with Dextana. Choose **Need the extension? → Open extension folder** in the login dialog, then load that folder through Chrome's Developer mode. Use **Copy connection code** to connect it. The extension can open the requested site, or—with explicit approval—use a signed-in site such as Gmail when the destination is on a separate login domain. See [setup and transfer details](docs/browser-login-transfer.md).

## Packaging

`npm run pack` builds the native app; `npm run dist` creates installers. End users need neither Harnest nor Python. CI builds and tests native macOS, Windows, and Linux packages with the pinned build-only compiler. See [packaging and CI](docs/packaging.md).

## Data and boundaries

The backend stores transcripts, action receipts, queues and plans in `agent-state/activities.sqlite`, and Harnest sessions/checkpoints in `agent-state/agent.sqlite`, inside the per-user application-data directory (`~/Library/Application Support/dextana` on macOS). Electron stores settings, browser bookmarks, chat permissions and UI metadata in `state.json`. Legacy transcripts are imported once after the backend commits them. The Fused token is in a separate encrypted file. `DEXTANA_USER_DATA` selects a different workspace for tests or development.

Harnest uses its managed ADK mode and native `ollama_chat` provider. The desktop starts the compiled backend on loopback with a random owner token, using its bundled private Python runtime. Only the trusted top-level renderer has the narrowly scoped preload API. Embedded pages have Chromium sandboxing, no Node.js, no preload bridge, separate persistent browser storage for each chat, denied device permissions, owner-confirmed downloads, and blocked popups. Browser tools accept fixed actions, observed element references, or viewport coordinates. Full DOM inspection includes ordinary content, hidden/offscreen elements, frames, and open/closed shadow roots, with explicit pagination instead of discarding targets. Screenshots, hover, scrolling, and double-clicks support visual controls. The agent cannot execute arbitrary JavaScript.

Chats save all their browser tabs, including pages you navigate to yourself. Closed tabs remain closed after restart. After restarting Dextana, select the chat and click **Reopen browser** to restore a page, then select other saved tabs to reopen them. Each chat retains its own persistent cookies and local storage; sites may still require you to sign in again. Unsent forms and page history are not restored. Reopening loads the saved address without replaying previous clicks or submissions. Pages load only when you reopen them or approve a new browser action.

Browser isolation is Chromium process/session isolation, **not a VM or container**. Pages can access normal HTTP(S) network destinations, including local/intranet sites. Browser contents and tool results remain untrusted model input. Review sensitive work and use appropriately scoped Fused operations.

## Current limits

- Native alpha installers include the compiled backend and private Python runtime. Code signing, notarization, and auto-updates are not yet configured. See [packaging and CI](docs/packaging.md).
- Browser automation supports top-level page navigation, reading, filling, and clicking. Browser file uploads are not implemented. PDFs can be viewed inline and files downloaded through a native Save dialog; see [browser files](docs/browser-files.md).
- SQLite storage supports one backend process per local workspace. Completed Harnest sessions persist across restarts. Interrupted executions receive a fresh session with historical context; uncertain actions are never replayed automatically.
- Thinking is shown when the selected Ollama model emits it. It streams in an expanded grey panel, then collapses into “Thought for …” when the answer arrives. Text and thinking continue streaming after desktop tool actions; saved thoughts can be reopened after restart.
- The backend enforces eight active runs, a fifteen-minute inactivity deadline renewed by execution progress, and bounded delegation. Progressing runs have no fixed desktop-action count limit. Actual parallel model inference depends on Ollama's configuration and available memory.
- Fused operation authoring and dynamic connected-user selector configuration stay in Fused's tools for now.

See [architecture](docs/architecture.md) for code boundaries and extension points. Licensed under the [Dextana No-Resale License](LICENSE). Personal and business use are allowed; selling or repackaging Dextana for resale requires written permission from [Fused](https://usefused.com).

### Work documents and chat context

Use **Files** beside the message composer or **+** in Context to select Word (`.docx`), PDF, Excel (`.xlsx`), CSV, UTF-8 text/Markdown (`.txt`, `.md`), or PNG, JPEG, GIF and WebP images. Selecting a file shares its path, not its contents. Ask Dextana to read it; the desktop displays a permission request before the file is opened. The selected model receives approved document contents or typed image media. Images require a vision-capable model.

Ask for a budget workbook, contact table, meeting notes, or another work deliverable. Creation shows the destination and a document/table preview before saving. A simple filename saves in **Documents/Dextana**; an absolute path can target an existing folder. Creation never overwrites existing files. To edit an existing file, Dext first reads it, then shows the current and proposed changes for review. UTF-8 text files of any extension support full replacement; Word DOCX supports targeted paragraph-text replacements; Excel XLSX supports existing literal-cell updates while retaining styles and formulas elsewhere. Choose **Apply changes** to save or **Keep original** to decline. Every edit requires approval, including in auto-allow sessions and approved plans. A changed file must be read and reviewed again. Formula cells, protected documents, complex Word content, legacy DOC/XLS, PDFs, images and other binary formats require a dedicated editor. XLSX formulas recalculate when opened in Excel. Use **Open** in the top-right **Context** box to launch the result in its default installed app, or **Show in folder** to find it.

Reads and creation have independent **Allow action**, **Deny action**, and chat-scoped **Auto-allow** choices. Revoke automatic access with **Ask next time** on its in-chat confirmation. Ordinary chat permissions do not transfer to other chats or delegated workers; an explicitly approved plan shares only its listed resources with its workers for that run. Cancelling or denying a pending request prevents that action.

The searchable Context panel groups references into **Files**, **Links**, and **Desktop**, with counts and read/created statuses. Groups start collapsed; attaching context opens Files, and search reveals matching groups. It records up to 100 recent file/link references for the selected chat. These references survive restart; they are not a claim that a complete document remains in the model's token window. Opening a link uses your default browser. In a narrow split view, Context sits above the conversation without covering messages.

Excel outputs use formatted headers, frozen header rows, and table filters; formulas in existing workbooks return cached values without recalculation. Supported limits: 5 MB input files, 20 MB expanded workbook data, 20 sheets, 100 columns, 10,000 cells, and 500,000 text characters. CSV creation accepts one structured table and escapes formula-like text. Word and PDF support text extraction; scanned PDFs still require OCR. Creation supports XLSX, CSV, TXT and Markdown.

### Rich replies

Chat Markdown and A2UI text share typography and rendering components. Replies support scrollable tables, image previews, copyable code, bar/line/area charts, and Mermaid diagrams. Charts expose their underlying data; diagrams expose their source. Remote images load only when you choose **Show image**, through a bounded image fetch that sends no browser cookies. An unsupported A2UI component leaves its valid siblings visible.
