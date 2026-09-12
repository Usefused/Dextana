export const cases = [
  {
    id: 'fresh_my_browser',
    seed: false,
    empty: false,
    prompt: 'Hey hey, can you use the zoho on my browser please',
  },
  {
    id: 'existing_inapp',
    seed: true,
    empty: false,
    prompt: 'Hey hey, can you use the zoho on my browser please',
  },
  {
    id: 'explicit_correction',
    seed: true,
    empty: false,
    prompt:
      'I just said not inapp. My computer use browser. Tell me the subject of the newest email.',
  },
  {
    id: 'autonomous_tab',
    seed: false,
    empty: true,
    prompt:
      'Use my external Chrome browser. Open the Zoho Mail test inbox at {inboxUrl} in your own new tab and tell me the subject of the newest email.',
  },
];
export const inbox = `<!doctype html><title>Zoho Mail — Inbox</title><main><h1>Zoho Mail</h1><h2>Inbox</h2><p>Signed in as synthetic-owner@example.test</p><article><h3>September planning review</h3><p>From: synthetic-colleague@example.test</p><p>Received: Today, 09:05</p><p>The planning review is on Friday at 10:00.</p></article></main>`;
