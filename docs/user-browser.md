# Work across your existing browser tabs

You can ask Dext to use your external Chrome or Edge browser directly in chat. The agent invokes `browser(action="connect_user")` through the existing approval flow. After you approve, Dext reuses an active browser-wide connection, or opens the connection dialog. Activate the extension there; the pending tool call then resumes with the connected tabs and Dext continues the original task. Pairing codes stay in the trusted UI and never enter tool results. Closing the dialog or cancelling an unactivated request rejects the pending connection without switching to the in-app browser. Cancelling work after activation leaves the browser connection available.

In a chat, choose **Use my browser**, then **Create connection code**. Copy the code, open **Dextana Browser** in Chrome or Edge, paste it, and choose **Activate browser access**. By default this grants access to all regular web tabs in that browser profile, across windows, including tabs opened later. Dext can open its own task tabs. Other chats reuse this activation through their normal browser approval flow. Keep Dextana open.

Chats share browser-wide activation but keep their own last-used tab. Switching chats or connecting a second chat does not replace the activation or navigate the first chat's tab. Simultaneous agent connection requests wait for the same activation; cancelling one waiter leaves the others waiting. Creating another code cannot silently revoke an existing connection. A selected-tab grant still belongs only to its original chat.

For a smaller scope, tick **Granular control** before activation. Select up to twelve existing tabs, use **Select all**, or leave them unchecked to let Dext open task tabs. Granular connections belong to that chat and exclude unselected tabs. This choice is made in the extension, not by the agent.

Browser action auto-approval in a chat does not change the extension's tab grant. `list_tabs` reports its actual scope and coverage. If you ask to reuse an existing tab that is outside a selected-tab grant, Dext must request access to it instead of opening a replacement. Protocol 4 requires explicit scope from the extension; older workers must be reloaded and cannot silently downgrade browser-wide activation to selected tabs.

The connection and its scope appear in **Context**. Browser-wide connections add individual tabs to that chat's Context as Dext uses them; granular connections show the selected tabs. Normal chat approvals still apply to browser actions. **Stop browser control** in the chat, extension or tray revokes the connection for every chat using it. Switching one chat to the in-app browser releases that chat without revoking access used by other chats.

Activated connections no longer expire after fifteen minutes or end when a task finishes or is cancelled. Temporary transport failures and extension service worker restarts reconnect automatically. Pending actions with an uncertain outcome are cancelled and never replayed; Dext must inspect the page before retrying. The fifteen-minute limit applies only to unused codes. A full Dextana quit/restart, explicit Stop, or extension removal still requires fresh activation. Full browser access is retained in extension storage so a browser restart can reconnect while Dextana remains running; granular activation is retained only for that browser session.

**Show browser** and the in-app tab strip let you view saved in-app pages even while Chrome is attached or its connection has stopped. Viewing a page does not switch the agent's browser target, reset the Chrome connection, or authorize a pending action against a different tab. Use **Use Dext’s in-app browser** to change where the agent works.

For installation, expand **Install or update the extension** and choose **Open extension folder**. Load the stable `Dextana Login` folder using Developer mode in `chrome://extensions` or `edge://extensions`. The displayed extension name is **Dextana Browser**. Updating Dextana requires refreshing that folder and reloading the extension. It is bundled, but not yet distributed through a browser extension store.

## Supported actions

- Inspect page text and paginated elements in the top document and open shadow roots.
- Fill text fields; click and hover observed controls with real browser input.
- Press Enter, Escape, Tab, Space, Backspace, Delete, arrows, Home and End.
- Scroll at observed viewport coordinates; capture a viewport screenshot.
- Discover current and future regular web tabs across windows (bounded to 1,000 tabs), or up to twelve selected tabs in granular mode.
- Read or act on different connected tabs concurrently; actions on the same tab must finish before the next starts.
- Navigate connected tabs across websites and open additional task tabs using the same browser session.
- Close tabs created by Dext. Existing user tabs can only be closed manually; closing or detaching one leaves the others connected.

In granular mode, unselected existing tabs stay outside the connection. Tab IDs are connection-scoped, so changing the foreground tab never changes the action target. Stop releases control of every connected tab and leaves their pages open. Task completion keeps the activation ready for further work.

This mode currently excludes embedded-frame controls, coordinate clicks, double-clicks, clipboard access and download completion tracking. Browser-managed pages, private windows and non-HTTP(S) URLs cannot be attached. Chrome/Edge support is based on Chromium APIs; Firefox and Safari adapters are not implemented. Windows and Linux have not received live acceptance testing for this feature.

## Agent and desktop boundary

Harnest discovers and progressively loads the existing `browser-work` skill. The existing `browser` client tool routes through `LocalCapabilities` and `Browsers` to `UserBrowser`; there is no additional browser tool catalog, classifier agent, model loop or website-specific agent. The skill explains attached-mode limitations and requires outcome verification. Harnest retains conversation, tool execution, approvals and public tab references. Website content is untrusted data.

Electron owns the chat-to-connection map and exposes a temporary authenticated IPv4 loopback receiver. The browser extension is the native browser adapter. The pairing token stays in the trusted dialog and extension-owned memory/storage (session storage for recovery and local storage for browser-wide reactivation while Dext runs); snapshots and agent context contain page metadata, not the token. Each request is delivered once, has one matching response, and cannot be replayed. Inputs are bounded and allowlisted. The extension cannot receive arbitrary model-authored JavaScript or CDP method names.

The extension binds a separate public handle to each authorized native tab ID, uses an authored isolated-world DOM function through the debugger Page and Runtime domains for inspection, and dispatches trusted input with `chrome.debugger`. Page references belong to one observation and expire after 60 seconds; input invalidates them. Actions awaiting approval retain their connection and URL. Website navigation can be rediscovered with read, but a mutating action cannot silently follow a changed URL. The extension rechecks the active desktop request before each input dispatch. Stop prevents further dispatch; input already delivered cannot be undone, so uncertain outcomes require inspection before retrying.

Chrome requires `debugger` as an installation permission; it cannot be an optional permission. The `tabs` permission lets the extension discover web tabs and present the optional granular picker. Browser-wide activation is explicit; per-action chat approvals remain in force. Debuggers attach lazily when an action targets a tab. No native tab IDs are sent to the agent. The service worker stays alive while the debugger is attached on Chrome 118+. The extension's existing login-transfer mode remains a separate approval flow. See the primary [debugger documentation](https://developer.chrome.com/docs/extensions/reference/api/debugger), [permission restrictions](https://developer.chrome.com/docs/extensions/reference/api/permissions), and [isolated world documentation](https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-createIsolatedWorld).

## Verification

`tests/e2e/browser-show-attached.spec.ts` checks showing and switching in-app tabs with an active Chrome connection, confirms that the agent still reads the attached Chrome tab, and checks that viewing remains available after the connection stops.

`tests/unit/user-browser.test.ts` exercises real loopback authentication, Host/Origin validation, one-time attachment/delivery, stale approval rejection, replacement, cancellation and input limits. `tests/e2e/user-browser.spec.ts` loads the shipped extension into a disposable Chromium profile, verifies real trusted typing/clicking and stale-reference rejection, checks concurrent input on two different origins, wrong-tab references, unrelated-tab isolation, cross-site navigation, new-tab creation and closure, then runs a full managed Harnest skill/tool/approval flow in Electron. The managed test copies an observed field from one selected tab to another and confirms the page effect, both Context entries, public tab references and a plain-language result. The model provider is scripted for repeatable integration testing; this does not measure a model's autonomous success rate on arbitrary websites.

The shared desktop complexity gate includes the browser adapter, extension and React controls, with a maximum of 10 per function. App and backend builds, the unit suites, and the focused browser E2E tests are required before release. No personal browser profile or account is used by these fixtures.

Idle connections use an extension API heartbeat; Stop ends it. Missed desktop heartbeats mark the connection as reconnecting without revoking activation. This follows Chrome’s [service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).

Explicit owner corrections such as “my browser” and “not in-app” are enforced by desktop routing, independently of the model’s tool selection. A bare read/open/list request is redirected to the approval-gated external connection when needed; its original page action is not replayed. Assistant messages, generated prompts, tool output and document content cannot set this choice. The in-app switch in the dialog overrides older chat preferences. Browser results identify their actual surface.

`tests/e2e/browser-wide.spec.ts` verifies default access across thirteen existing tabs, future-tab discovery, cross-chat reuse, real page input, transport recovery and an actual service worker restart. `browser-tab-selection.spec.ts` verifies optional granular selection and the twelve-tab bound. Live model behavior is measured separately by `evals/browser-use`.
