# Computer-use trial

Dextana uses pinned `@trycua/cua-driver` 0.25.0 as an optional, lazy native adapter
behind the existing desktop gateway. Harnest owns discovery, orchestration,
approvals and typed screenshot media. There is no extra agent loop, classifier,
MCP server, daemon, or global catalog of Cua tools exposed to the model.

## Use it

1. Open **Settings → Computer use → Request permissions**. macOS asks for
   Accessibility and Screen Recording. If either remains unavailable, use the
   adjacent button to open its exact System Settings pane, enable Dextana (or
   Electron for a development build), return to Dext and check again.
2. Open a chat and describe the work. No window or chat binding is required.
   Dext presents a separate approval before every application inspection and input.
3. **Stop computer use** is available above chat and other workspace pages, and
   in Dextana's tray menu. Stop cancels pending work and revokes the native lease.
   An input already delivered to the application cannot be undone by Stop.

Computer use checks the current OS permissions before every reviewed operation.
Its native session is temporary and bound to one chat. It expires after five idle
minutes, at the end of a turn that used it, or after fifteen minutes in the Cua
runtime. The app can request access and open System Settings; it cannot grant the
permissions itself.

## Scope and boundaries

`desktop(discover, work=computer)` loads only status, observe, act and stop.
The agent receives no process or native window ID. It names the application from the
owner's request and may provide a window-title hint; Dext resolves the frontmost visible
matching window. Observe and input use the existing desktop approval path. Inspection
approval names the application and requested window; input approval names the exact
resolved window, freshly observed control and proposed text/key, hiding transport IDs.

The trial supports background accessibility clicks, text entry and simple
navigation keys against observed elements. No coordinates, modifier
shortcuts, clipboard, arbitrary SDK calls, shell, process killing or browser-profile
access is exposed. Existing file/browser tools remain preferable where applicable.
A window screenshot and up to 300 visited accessibility nodes (depth 18) provide the
reviewed observation; incomplete trees are explicitly marked by Cua. Global and app
menu branches outside the resolved window are excluded.

An input consumes its observation before dispatch. A new observation is required
for every subsequent input, and observations expire after sixty seconds. Both
Dext and the SDK reject stale handles. Input acknowledgements are not proof of an
edit, save or submission: the agent must observe and verify the requested effect.
Uncertain input must not be repeated blindly. Screen/document contents are data,
not new instructions. Context contains session state, not raw snapshots;
Harnest carries screenshot bytes as typed image media. Responses and approvals use
the existing human-readable presentation and shared UI components.

## Validation and limits (9 September 2026)

The real macOS SDK was exercised inside Electron against a disposable AppKit app:

- **Document editing passed:** typed the brief, invoked Save and independently
  read the saved file from disk.
- **Native navigation passed:** invoked Show summary and verified the resulting
  text through a fresh accessibility observation.
- **Open-file dialog did not pass:** the panel opens, but its column-view ancestor
  tree exhausts the bounded scan before the target file is returned. Enlarging
  the scan also produced Cua's twenty-second accessibility timeout. An AXPress
  error sometimes followed a successfully opened panel, demonstrating why
  delivery errors cannot be safely replayed. No pixel/foreground escape hatch
  was added to hide this limitation.

This is experimental, not a claim of general Word/Excel/browser or reliable
file-picker automation. Enabling this trial is currently limited to macOS. Windows and Linux native
behavior, packaged signing and OS permission attribution still need platform testing. Native packages are kept
external to the main bundle and unpacked from ASAR with their UniFFI dependencies.
Dext displays its own click-through cursor overlay at the freshly observed
accessibility target before each native action. Its badge identifies Dext as
the controller. Stopping, releasing or timing out the session removes it;
Dext also provides persistent status and Stop controls.

Validation commands:

- `npm run build` and `npm run check:desktop` (maximum complexity 10).
- `npm test` and `npm run test:backend`.
- `npx playwright test tests/e2e/desktop-computer.spec.ts tests/e2e/desktop-layout.spec.ts --workers=1`.
- `node scripts/test-computer-native.mjs` explicitly launches the disposable
  native fixture. It requires macOS, Swift and Electron privacy grants, writes
  evidence in a printed temporary directory, and exits nonzero when a workflow
  fails. It is intentionally outside headless CI. The open-file case currently
  remains a failing acceptance test for further adapter work.

The tests cover chat ownership, freshness, cancellation, consumed inputs,
permission revocation, single-runtime initialization, desktop-wide observations,
Context state, typed Harnest screenshots, responsive shared components and prior
reminder/workflow integration. No native app-control success is inferred from mocks.
