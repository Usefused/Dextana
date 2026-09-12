# Fused MCP manual test — 9 September 2026

Tested the source-built Dext desktop UI with the owner's existing signed-in Fused workspace and `fused-all-purpose` version `1.0.3`. This was a live MCP test, separate from the synthetic regression fixture.

## Verified

- Saved the existing MCP with automatic agent tokens enabled and Allowed operation IDs blank. Setup connected successfully and discovered `search_docs` and `execute`; no synthetic `connect` tool was offered.
- Enabled the two discovered tools with Ask every time permissions.
- In a dedicated Work activity, Dext listed the MCP catalog and requested approval for its first `search_docs` call. Approval showed the CLI default `*`, 24-hour expiry, selected version, and actual tool arguments.
- Fused returned documentation for `calendar.calendarList.list`, followed by its exact schema and pagination guidance.
- The activity log recorded an `execute` invocation and a received result for the calendar operation. The result was `connection_required`, not provider data. Automatic review rejected the tester's calendar approval attempt because it could expose private calendar metadata; the subsequently observed application log nevertheless records the invocation. No successful provider read is claimed.
- After restarting the app, Dext used the native MCP catalog and requested fresh first-use approval for a runtime-only execution:

```typescript
return { test: "dext-manual-mcp", result: 6 * 7 };
```

The real MCP returned `{ "test": "dext-manual-mcp", "result": 42 }`, and Dext displayed it in a Completed activity. This verifies live transport, token issuance, approval, execution, and response delivery. It does not verify Google OAuth or a successful provider API call.

## Fixes and checks

Allowed operation IDs are optional; Dext omits `--allow` when blank and validates the returned default scope. Adding an MCP now tests/discovers before saving, with temporary-token cleanup. Connection setup is no longer exposed as an agent tool. Agent guidance distinguishes workspace MCPs from separately configured Fused integrations after the model incorrectly selected the older tool during the test.

Build and 24 focused unit tests passed. The Electron Fused onboarding regression passed with a synthetic CLI and local MCP, covering unrestricted default token generation, automatic setup discovery, denial, tool invocation, per-chat leases, restart, and cleanup.

Concurrent Electron regression windows interfered with native UI targeting; the final live check used the same source and owner profile under a temporary Electron app with a distinct bundle identity.
