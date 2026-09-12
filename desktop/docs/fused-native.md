# Native Fused onboarding

Settings → Connectors → Add → Fused opens browser authentication through
`fused-cli login --engine-url <url> --no-input`. Dext verifies the resulting
identity with `whoami --json`, then pages through `mcp list --json`. Active
versions are selectable individually; Dext uses the versioned Streamable HTTP
endpoint and rejects endpoints on another origin.

Fused setup can install the pinned CLI for Dextana, detect a compatible installation on PATH, or let the owner locate one with a file picker. See [CLI installation](fused-cli-installation.md). Dext uses an isolated
`fused-workspace` under its application data directory, supplies a private
`XDG_CONFIG_HOME`, and removes inherited `FUSED_*` credentials from the child
environment. The CLI login configuration is encrypted using Electron safeStorage
between commands. During a command it is temporarily decrypted to a private
configuration directory, which is removed when the command ends. It is never
included in snapshots, conversations, diagnostics, or agent tools. Disconnect
runs CLI logout to revoke the CLI login before deleting the encrypted copy.
Previously entered license-key accounts remain accessible for removal.

Adding an MCP tests its connection and discovers its actual tools before saving it. Setup uses a temporary token, closes the test client, and revokes that token on success or failure. A failed test preserves any existing connection. The **Test connection** button runs the same discovery flow. Neither action executes a service operation or retains an agent token. Connection setup is not an agent tool.

Allowed operation IDs are optional. Leaving them blank omits `--allow`, using the CLI default `*` for all operations exposed by the MCP. An explicit list restricts access to those exact IDs. Automatic agent tokens can be enabled per MCP; first use of an enabled tool requires approval showing the scope, 24-hour expiry, pinned endpoint, tool, and arguments.

## Scoped execution tokens

After the exact first-use approval, Dext verifies the CLI identity and invokes
`mcp token generate <mcp-id> <unique-name> --json --expires-in 24h`, adding
`--allow <exact-operation-ids>` only when restrictions were supplied. It validates the JSON MCP identity, token name, requested scope (including the default `*`),
secret and bounded expiry before contacting the pinned endpoint. Tokens remain
in main-process memory, scoped to the connection and chat; they are never saved
in state.json or sent to the model. New or changed tools are disabled until the
owner enables them in MCP settings. Subsequent tool calls follow normal approval
policies. When a token is missing or expired, a direct call to an enabled tool requests approval to create a token and execute that exact action. Enabled tools remain discoverable across chats and restarts; the model does not need to reconnect explicitly. A valid token is reused within its chat. Token issuance always requires approval, even when the tool, chat, or plan otherwise allows automatic execution.

Dext requests revocation when replacing, removing, or disconnecting a connection,
on expiry, and during shutdown. Revocation is best effort if the Engine is
unreachable; the server-enforced 24-hour expiry remains the backstop. Failed or
uncertain issuance triggers cleanup by its unique token name and returns a
non-retryable instruction to the agent. No issuance is automatically retried.
A declined approval never invokes token generation.

Tests use a synthetic CLI with the verified token JSON contract and a local MCP
server, alongside real Electron encryption and the Harnest approval flow. They
cover denied issuance, one approved mint, secret exclusion, tool discovery,
execution approval, direct-call issuance in new chats, denial without issuance, token reuse, restart recovery, and disconnect revocation without using a production account.
