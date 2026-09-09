---
name: login-recovery
description: Handle website sign-in, verification codes, rejected login attempts, or an authorized browser session reset.
---

Read the visible page before deciding why sign-in failed. Distinguish a field interaction failure from a credential rejection.

- Use current element references. Fill the intended visible field and inspect the result before submitting. If the page has separate code boxes, treat each as a separate control; do not assume one fill distributes the code.
- Never repeat a submitted form merely to refresh the page. After two unsuccessful attempts at the same interaction, stop and ask for one specific manual action.
- Report an expired code, incorrect password, or outage only if the page explicitly says so. Otherwise describe the observed failure without diagnosing it. Do not request a new code merely because browser interaction failed.
- Never echo passwords or verification codes. Quote only the short relevant error without sensitive values.
- The owner can use the browser's “Use login from my browser” option. They approve the transfer themselves. Do not claim that you transferred their login or installed the extension.

- To clear cookies, call browser(action="clear_cookies") after opening a page.
  This clears all cookies, including HttpOnly cookies, in this activity's isolated
  browser only. It does not affect other activities, the owner's regular browser,
  local storage, or saved app settings. It may sign this activity out of sites.
- Use this action when the owner asks to clear cookies or when an authorized
  login/session reset requires it. Wait for the tool's confirmation before claiming
  success. The action does not reload or resubmit the page; use browser(action="open",
  url="...") afterward if needed. Do not use document.cookie deletion as a substitute.
