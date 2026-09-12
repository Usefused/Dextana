# Google login transfer acceptance flow

Use the running Dextana app and an ordinary Chrome profile. Let the account owner choose their Google account, complete sign-in, and approve Chrome's requested access. Do not log cookies, storage values, pairing codes, passwords, or account identifiers in test artifacts.

1. Start a separate Dextana chat with: “Open https://accounts.google.com/ in the in-app browser. I will sign in using Chrome and approve login transfer myself. Stop at the sign-in page. Do not read email or change account settings.” Allow that navigation.
2. Choose **Use login from my browser** and copy the connection code. Keep the dialog open.
3. In Chrome, open Google Account and select the account to use. Open **Dextana Browser**, paste the code and connect. If an extension update is required, follow **Open extension settings**, reload, return to the Google tab, reopen the extension and paste the code again. Do not reload during an active direct browser-control session.
4. Confirm that the displayed source site, destination chat and cookie hosts are correct. A Google redirect may place Chrome at `myaccount.google.com` while Dextana requested `accounts.google.com`. In that case the button must read **Transfer login and open this site**; there is no second consent checkbox. Keep **Sign-in cookies** selected; other data is optional.
5. The owner clicks the transfer button and approves Chrome's permission dialog. Close the extension popup while the prompt is open or immediately afterward. The job must continue in the worker; reopening the extension must show progress or its result. Denying access must not start capture.
6. Inspect the destination page in Dextana. A transfer completion notice alone is not a pass. Google must show the intended signed-in account page, and a refresh/new tab in that chat must retain usable authentication. A public account-marketing page, sign-in form, account mismatch or extra provider challenge is an incomplete login; report the visible result without claiming success.

Automated regressions:

```sh
npm run build
npx vitest run tests/unit/login-runtime.test.ts tests/unit/login-scope.test.ts tests/unit/login-transfer-worker.test.ts tests/unit/session-transfer.test.ts tests/unit/browser-extension.test.ts
npx playwright test tests/e2e/session-transfer.spec.ts tests/e2e/login-cookie-scope.spec.ts --project=desktop
```

The automated profiles use synthetic data and do not access the owner's Chrome profile. They cover transport, popup lifetime, extension updates, cookie scope and import behavior. They cannot establish that Google accepts a real copied session; that requires step 6.
