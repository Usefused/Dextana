# Desktop capabilities

Dextana connects its Harnest agent to the device through a typed desktop interface.
The agent has one `desktop` tool. It discovers the relevant category (`time`,
`files`, `workflows`, `processing`, or `device`), then calls a returned operation.
Changing category replaces the catalog for that chat. Catalog discovery does not
grant permission, and operation availability is checked again before execution.

Harnest owns managed tool discovery, progressive skill loading, native approval
continuations, agent sessions, and scheduled agent work. The desktop bridge owns
native effects and binds single-use execution tickets to the current Harnest call
and chat. It never exposes a shell or arbitrary command execution tool.

## Timers and reminders

Choose **Desktop** in the Workspace menu to manage timers and local workflows. **Scheduled jobs** remains the home of scheduled agent work. Timers support
pause, resume, cancel, snooze and dismiss. Reminders and timers store absolute
deadlines on disk; restarting does not restart their duration. Paused timers retain
their remaining duration. Due alerts stay visible until dismissed or snoozed.

With **Keep Dextana running when its window closes** enabled, closing the window
hides it and leaves the tray/menu-bar app running. Use the tray to reopen it or
quit. A fully quit app cannot issue an alert, and a sleeping or powered-off device
cannot sound it. Missed reminders are shown on the next launch or wake; delays of
at least one minute are marked overdue. This version does not install a login
service or create entries in the operating system's Clock or Reminders app.

Existing Harnest reminders still post into their originating chat and are imported
once into the desktop alarm list. Recurring overdue reminders coalesce rather than
replaying a backlog. Missed scheduled agent work continues to be skipped. Native
notification suppression does not remove the persistent in-app reminder.

## Files and Context

**Open** on a file in Context launches its default installed application. XLSX and
DOCX files therefore use the user's configured spreadsheet and document apps.
Failures such as missing applications are shown in the chat. **Show in folder**
remains available. No upload occurs, and opening a file does not give Dextana
control over the application's editing interface.

Desktop resources created or used in a chat appear in its **Context → Desktop**
group: timers, reminders, watched folders, processing jobs, rename batches, app
handoffs and power policy. References have stable IDs, retain state across restart,
and open the corresponding desktop item. Files and web links remain in their own
Context groups. Context is a record of resources, not a grant of access.

## Workflows

- Watched folders observe stable changes in one selected directory. Existing files
  form a baseline. Changes discovered after restart are reconciled. The saved
  instructions start a new Harnest activity with ordinary action approvals.
  Outputs produced during that workflow become the baseline to prevent loops.
- Work setup opens requested documents, folders and HTTP(S) pages through their
  default handlers, returning the individual result for every target.
- File organisation first creates a durable rename preview. Applying it requires
  review of the actual source/destination mappings. Undo checks file identity and
  destination conflicts; it never overwrites an existing file. Interrupted batches
  remain available for review.
- Document handoff opens an existing document. Completion notifications can link
  to the originating chat and an output document; submitting a notification does
  not prove the OS displayed it.
- Local processing supports indexing of work documents, OCR with installed
  Tesseract, transcription with installed whisper.cpp and an existing local model,
  and conversion with installed LibreOffice. Dependencies and models are not
  automatically installed or downloaded. Capability discovery lists available
  processors. Jobs persist and expose their status and output path.
- Power policy pauses expensive processing and new watched-folder dispatch on
  battery by default. Active processing is stopped and restarted from the beginning
  on external power, rather than claiming all native processors support suspension.

## Implementation and validation

Platform-independent interfaces and receipts live in `src/shared/desktop*.ts`;
services and the gateway live in `src/main/desktop/`. Electron supplies native file
opening, notifications, power events and tray presentation on macOS, Windows and
Linux. Optional processors are detected per device. Linux session/tray/notification
availability depends on the desktop environment.

Dedicated unit tests exercise persistence, ownership, cancellation, changed
capabilities, rename conflicts and processor discovery. Desktop E2E tests run the
actual Electron app and compiled Harnest backend, with external model and OS-launch
boundaries substituted where needed. Native packaging and OS presentation still
require verification on each target platform.

The desktop review gate is `npm run check:desktop`, also run by source CI and
`npm run check`. It enforces cyclomatic complexity of at most 10 per function in
the desktop services, their main-process integration, Context panel and desktop
views, and the Harnest scheduler/desktop transport. Nested callbacks are checked
independently; logical branches, optional access and default arguments count in
TypeScript. The Python check uses the standard library and includes short circuits,
comprehensions and exception handlers. Existing unrelated application code is not
covered by this desktop-specific gate.

Comments explain invariants such as durable alert claims, crash recovery and
single-use approval receipts. Desktop action receipts recheck session permission
before execution; a revoked permission cannot authorize a prepared action.

## Experimental computer use

The Cua SDK now connects through this same desktop layer. Owners grant OS
permissions and select one window for one chat; Harnest discovers only the
computer operations needed for that work. See [the trial and its measured limits](computer-use-trial.md).
