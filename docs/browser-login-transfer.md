# Website login transfer

When a website shows a sign-in form, a compact popup offers **Use login from my browser** over the page. It can be dismissed; a key icon in the browser header also opens the flow manually. Detection uses visible password fields and sign-in headings or prompts, so the icon remains available for sites it does not recognize. Signing in directly remains available. No transfer occurs automatically, including when chat browser actions are set to auto-allow.

## Install the Chrome extension

The extension is included with Dextana, including packaged downloads. In the login dialog, expand **Need the extension?** and click **Open extension folder**. Dextana copies the bundled files into a stable `Browser Extensions/Dextana Login` directory under its application-data folder and opens it. There is no source-project folder to locate.

In Chrome, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select that **Dextana Login** folder. Pin **Dextana Login Transfer** to the toolbar. Keep the folder in place; Chrome loads the extension from there. After updating Dextana, use **Open extension folder** to refresh this copy, then reload the extension on Chrome's extensions page.

This is a manual unpacked installation, not a Chrome Web Store installation or silent install. Chrome's Developer mode step is still required and managed browsers may disable it. See [Chrome's distribution guidance](https://developer.chrome.com/docs/extensions/how-to/distribute).

Development reads `browser-extension` from the app checkout. Packaged builds ship it as an extra resource outside `app.asar`; runtime selects the source using `app.isPackaged`. Both copy to the same stable user-data location.

## Transfer a login

1. In Dextana, open the destination website tab and choose **Use login from my browser** in the popup, or click the key icon in the header.
2. Click **Copy connection code** in the dialog.
3. In Chrome, open **Dextana Login Transfer**, paste the code, and click **Connect to Dextana**. Use **Open requested website** to open the requested site, then reopen the extension; the code is retained so you do not have to type it again. You can also start from an existing signed-in tab.
4. If the signed-in tab differs from the login page (for example, Gmail versus Google Accounts), explicitly approve opening that signed-in website in Dextana. Its storage stays on its own origin. Choose cookies, local storage, and/or session storage. Cookies start selected; storage is opt-in. Click **Approve and transfer**, then grant Chrome's requested permission.
5. Return to Dextana and check that the website accepted the login. A successful copy does not itself prove authentication. Continue the conversation when ready.

The approval identifies the source website and destination chat. No cookie or storage read happens before approval. Cancel in either approval surface to avoid capture/import; after an import starts, allow it to finish and inspect the result. Closing the Chrome popup during an upload does not undo a transfer that Dextana has already received.

Matching cookie identities and storage keys are replaced. Other keys remain. The destination tab reloads, so finish unsaved work first. Cookies and local storage are shared with the destination chat's other tabs; session storage is installed only in the chosen tab. Other chats retain their isolated browser sessions. The source browser is unchanged.

## Implementation

`src/main/session-transfer.ts` runs a temporary IPv4-loopback HTTP receiver on a random port. Its random connection token is issued in the desktop dialog. The extension retains only this pairing code in Chrome session storage while opening the requested website, and clears it on cancellation or a transfer attempt. Metadata requests and uploads require that token; uploads also require an extension Origin. The receiver accepts one upload, rejects unapproved categories and out-of-origin cookies, and never publishes credential values to the renderer, agent tools, saved conversation, or logs. Closing the dialog invalidates an unused connection. No public listener, external relay, login vault, or saved transfer payload is used.

`browser-extension` reads only the selected source tab's cookies from its cookie store, including HttpOnly cookies, and optional top-frame storage through an isolated script. It rechecks the source URL before upload. A different source origin requires separate explicit consent; the extension strips query/fragment metadata, and the server validates cookies against that source and stages storage at the approved source URL before loading it in the existing Dextana tab. Google-related hosts are not treated as interchangeable storage origins. Chrome asks for optional cookie/site permission at approval; the popup releases this optional access after the attempt.

`src/main/import-login.ts` intercepts a temporary blank document at the destination URL using Electron's private debugger connection. It installs storage and cookies before loading the real website. The browser validates that the exact destination tab and URL still match and excludes concurrent agent browser actions in that chat during installation. Debugger interception is removed in `finally`. No browser debugging port is opened.

Imported state follows normal Chromium persistence and original cookie expiry. Dextana adds no login expiry, access timer, disconnect policy, or extra per-action grant. Session storage normally lasts for that browser tab; it is not restored after app restart. Persistent cookies/local storage follow the chat's existing persistent browser partition.

Transfer supports HTTPS websites and HTTP loopback sites for local development. It does not export passwords, IndexedDB, browser profiles, or partitioned cookies. Payloads are bounded to 4 MB and 1,000 entries per category. Device-bound logins, MFA, and provider policy may require direct sign-in. Installation or navigation failure can leave partially imported state; errors do not automatically retry, roll back provider activity, or claim that nothing changed.

## Tests

`tests/e2e/session-transfer.spec.ts` uses the actual Electron/Harnest application and a real Chromium extension with synthetic website data. The browser's cookie permission is pre-granted in the extension test fixture; the production source selection, approval UI, capture APIs, transport, and destination importer run unchanged. Coverage includes all three categories, HttpOnly/session cookies, state before the first application script, missing approval, replay/connection cancellation, stale destinations, and keeping credentials out of agent messages. Unit tests cover scope validation, expiry preservation, category consent, duplicate inputs, concurrent upload rejection, and source navigation checks.
