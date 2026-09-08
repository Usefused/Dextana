# Native Fused onboarding

Settings → MCP connections → Fused opens browser authentication through
`fused-cli login --engine-url <url> --no-input`. Dext verifies the resulting
identity with `whoami --json`, then pages through `mcp list --json`. Active
versions are selectable individually; Dext uses the versioned Streamable HTTP
endpoint and rejects endpoints on another origin.

The CLI must be on the application's PATH. Dext uses an isolated
`fused-workspace` under its application data directory, supplies a private
`XDG_CONFIG_HOME`, and removes inherited `FUSED_*` credentials from the child
environment. The CLI login configuration is encrypted using Electron safeStorage
between commands. During a command it is temporarily decrypted to a private
configuration directory, which is removed when the command ends. It is never
included in snapshots, conversations, diagnostics, or agent tools. Disconnect
runs CLI logout to revoke the CLI login before deleting the encrypted copy.
Previously entered license-key accounts remain accessible for removal.

Selecting an MCP does not mint a token. Automatic tokens are an explicit per-MCP
opt-in with an exact operation allowlist. The selected server appears in the
agent catalog with a `connect` capability. First use requires an exact Harnest
approval, even if a chat or tool has auto-allow enabled. The approval displays
operation scope, 24-hour expiry, and the pinned version endpoint. Tokens are
MCP-wide across versions, so endpoint pinning is separate from token scope.

## Scoped execution tokens

After the exact first-use approval, Dext verifies the CLI identity and invokes
`mcp token generate <mcp-id> <unique-name> --json --allow <exact-operation-ids>
--expires-in 24h`. It validates the JSON MCP identity, token name, exact allowlist,
secret and bounded expiry before contacting the pinned endpoint. Tokens remain
in main-process memory, scoped to the connection and chat; they are never saved
in state.json or sent to the model. New or changed tools are disabled until the
owner enables them in MCP settings. Subsequent tool calls follow normal approval
policies. Expired tokens require a new connect approval.

Dext requests revocation when replacing, removing, or disconnecting a connection,
on expiry, and during shutdown. Revocation is best effort if the Engine is
unreachable; the server-enforced 24-hour expiry remains the backstop. Failed or
uncertain issuance triggers cleanup by its unique token name and returns a
non-retryable instruction to the agent. No issuance is automatically retried.
A declined approval never invokes token generation.

Tests use a synthetic CLI with the verified token JSON contract and a local MCP
server, alongside real Electron encryption and the Harnest approval flow. They
cover denied issuance, one approved mint, secret exclusion, tool discovery,
execution approval, and disconnect revocation without using a production account.
