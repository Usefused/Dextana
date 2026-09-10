# Browser downloads and PDF viewing

The in-app browser displays HTTP(S) PDFs using Chromium’s built-in viewer. The same isolated browser session handles the request, including signed-in cookies. Viewing a PDF does not attach or save it to the activity automatically. The agent can use screenshots for visual inspection; viewer DOM text is not proof that it has read the document.

Click a download link or open an attachment URL to start a transfer. The native Save dialog lets the owner choose a destination and confirm replacement of an existing file. Dextana never opens or executes a download automatically. The browser’s **Downloads** button shows this chat’s transfers, with progress, cancellation, failure, and **Show in folder** for saved files. Closing a tab cancels its active transfers. The list is session-only, retains up to 100 recent records across chats, and allows up to three active downloads per chat.

The agent’s `browser` tool includes `downloads` for checking its own activity’s transfers. A `completed` state with a saved path is the completion evidence; a clicked link or navigation receipt alone is insufficient. Opening an attachment may leave the previous page visible, which is normal. To extract a downloaded PDF’s text, use the file-reading tool and its normal permissions. Download permission does not grant file-reading permission.

Web pages retain sandboxing, context isolation, no Node integration, and no desktop preload bridge. Only the built-in PDF viewer can load Chromium UI resources. Other privileged URLs remain blocked. Plan-covered browser actions reject download redirects outside the approved origins; the native Save dialog remains required even when a browser action is pre-approved.

Browser file uploads are still unsupported. PDF viewing is not automatic PDF text extraction or OCR. These changes require a rebuilt/restarted desktop app; existing alpha installer artifacts are not updated by changing the source.

Regression coverage: `tests/e2e/browser-files.spec.ts` exercises a real authenticated PDF viewer, direct and clicked downloads, saved-file bytes, cancellation, and agent receipts in Electron. The OS save choice is automated in the test; the browser, transfer and backend are real. Unit tests cover activity isolation, completion-only file reveal, cancellation and network restrictions.

Download results cross an explicit field allowlist before reaching the model: filename, state, byte counts, saved path, and status message. Desktop transfer IDs and activity/tab ownership remain in desktop records for cancellation and reveal controls. New internal fields are excluded by default. The browser still supplies separate tab handles where needed for tool routing.

Chat renderers preserve data; they do not guess internal fields from UUID shapes or table headings. This boundary prevents download bookkeeping from entering new tool results, but does not sanitize previously saved replies or arbitrary model output. The Electron regression checks the actual tool payload received by the model and renders all its receipt fields in JSON, Markdown, and A2UI through the chat panel.

## Screenshot targeting

Both the in-app browser and attached Chrome/Edge tabs return `screenshot_id`, actual PNG `screenshot_size`, CSS `viewport` dimensions, and `coordinate_mapping` with screenshots. For visual targets, pass the ID and either `coordinate_space="screenshot"` (original image pixels) or `coordinate_space="normalized"` (fractions of the complete image, from 0 to less than 1) to click, hover, or scroll. Do not combine screenshot coordinates with an element ref. Normalized coordinates survive proportional full-image resizing, but not cropping. DOM references remain preferable when available.

The same shared implementation converts points using `cssX = imageX / imageWidth * viewportWidth` (and the equivalent for Y). It handles browser zoom and device pixel scaling using actual captured dimensions. Pinch zoom is rejected until reset. Capture state belongs to the tab, is consumed by input, and expires after 60 seconds. Document identity, viewport geometry, scroll events and observed DOM mutations are checked again before input. A changed or reused capture requires a new screenshot; selecting another foreground tab does not redirect an attached-browser action.

The optional image interpreter returns labelled normalized target estimates alongside observations. It filters malformed coordinates and uncertain targets, and excludes reasoning from the observations. These are model estimates, not verified element identities. CSS animations, canvas redraws and embedded-document changes can alter pixels without a top-document mutation; the agent must still verify the outcome after input. DOM targeting and native accessibility targeting remain available as before.

After an extension update, reload the Dextana extension and reconnect the browser to load the new capture/input implementation.

## Repeated browser actions

Each run tracks browser observations per tab. Changing element reference IDs or rereading a substring does not count as new information. Repeated unchanged results receive a recovery instruction and then stop the turn after eight observations; repeated identical errors stop after four attempts. New content or controls reset the counter. The guard cancels the active response and reports incomplete work instead of replaying the action. A later user turn starts a fresh tracker.
