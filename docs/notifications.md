# App notifications

The bell in the app header opens notification history. Services can publish an
in-app notification with an optional OS alert. The inbox keeps the latest 200
entries in the existing desktop store, including read and dismissal state.
New notifications show a temporary banner; older ones remain in the inbox across
restarts. Opening an entry marks it read and navigates to its chat or desktop item.
Opening the desktop item directly or selecting its source chat also marks related
notifications read and clears their banner. This leaves the reminder itself active
until it is dismissed or snoozed.
The shared service tracks the rendered page and the app window's focus. Events
already displayed on the focused page or in their source chat enter history as
read, without a banner or OS alert. Switching to that page or refocusing the app
also reads its outstanding notifications. An unfocused, hidden or minimized app
still alerts. Desktop's Timers and reminders and Workflows tabs are distinct pages.
OS permissions or delivery failures do not prevent in-app delivery.

Timers, scheduled reminders, workflow completions, desktop failures and scheduler
connection errors share this service. Alarm delivery and scheduling remain owned
by their existing services. An app notification is not a new scheduled job.

Chats also notify when they finish, fail, need approval, have a plan ready, or lose
their backend connection while you are viewing another chat, Settings or Desktop,
or the app is unfocused/minimized. The visible, focused chat stays quiet. Opening
the notification returns to that chat. Streaming updates and repeated snapshots do
not produce alerts; historical chat outcomes are not replayed on startup. Worker
completions are reported by their parent chat; worker approvals and errors can
still request attention. Watched-folder chats use this same path, and local
processing failures alert alongside existing processing completion notifications.

## Publishing from a service

Inject the `Notify` type from `src/shared/notifications.ts` into a service or
background-job host, passing `notifications.send` from the application composition
root. The service is independent of Electron and the renderer; its storage,
native delivery and navigation adapters are configured in `src/main/main.ts`.

```ts
await notify({
  source: 'Importer',
  title: 'Import complete',
  body: 'Your documents are ready.',
  severity: 'success',
  key: `import:${job.id}`,
  target: { kind: 'activity', activityId: job.activityId },
  page: 'workflows', // Optional page that also displays this result.
});
```

`source`, `title` and `body` are required. `native: false` publishes only in the
app. Targets are optional; untargeted OS alerts open the inbox. Event keys are
scoped to the source and suppress duplicate delivery while retained in history,
including dismissed entries. Use a new key for each new occurrence. Notifications
are serialized and saved before alerting; a storage failure rejects the send.
Service failures should handle that rejection without undoing completed work.
Services can set `page` to the page identifier reported by the renderer's `view`
command. Navigation and OS focus changes share the service's visibility check;
individual services do not need their own page or focus logic.

The renderer can read, dismiss and open existing entries through the authenticated
main-window IPC boundary, including acknowledging entries for a viewed source.
It cannot publish arbitrary notifications or override an entry's navigation target.
Background Python events already enter through the existing
desktop service adapters (for example scheduled reminders); a new backend service
should deliver its event to its main-process host and call the same `Notify`
dependency. No second notification database or model call is needed.
