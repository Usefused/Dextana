# Model connection authentication

Settings → Models supports two authentication methods for OpenAI-compatible endpoints:

- **Bearer API key** sends `Authorization: Bearer <key>`. This is the default for
  OpenRouter and standard compatible providers. Additional headers and body fields
  can be configured without replacing the Bearer header.
- **Custom headers and body** sends the configured headers and JSON fields, with
  no generated Bearer header. Use this for `X-API-Key`, custom Authorization schemes,
  tenant headers, or nested authentication objects. The separate API key field is
  ignored in this mode.

Headers are JSON string values, with up to 16 unique names. Body configuration is
a JSON object and can contain nested objects. It cannot replace model inputs,
tools or streaming configuration. Headers apply to discovery, chat, embeddings,
image interpretation and compaction. Body fields apply to model POST requests;
the GET model catalog has no body. Enter model IDs manually if a provider does
not expose a compatible header-authenticated catalog. This does not add OAuth
token refresh, request signing, or non-JSON provider protocols.

Authentication remains bound to the exact provider URL. Keys, custom headers and
body values are stored together using Electron's OS-encrypted credential storage,
separately from settings and transcripts. Saved values are not sent back to the
settings renderer; leaving the editors untouched preserves them. Editing either
custom editor replaces both saved custom objects. Use Clear custom authentication
to return to Bearer-only configuration. Changing the destination does not reuse
the previous destination's credentials.

OpenRouter's model catalog is public, so a successful catalog fetch does not prove
that a key works. Dextana checks its authenticated `/key` endpoint before accepting
discovery or saving. An HTTP 401/403 produces an authentication error and keeps the
form open. Embedding validation distinguishes rejected authentication from other
HTTP errors without displaying provider response bodies.

## MCP connections

Settings → Connectors → Custom MCP uses the same `AuthenticationFields` component
as Models: gray shared field cards, full-width modal controls, theme tokens and
8px radii. Select **Custom headers and body** to supply multiple headers and nested
JSON body credentials together. An explicit `Authorization` header can be included
alongside tenant headers. Bearer, single-header, single-body-field and unauthenticated
connections remain supported; local stdio tools continue to use encrypted environment
variables.

MCP headers accompany HTTP requests. Body credentials are added only to JSON POST
messages, never to tool arguments; this is for gateways that explicitly support
body authentication. MCP framing, session headers and JSON-RPC fields cannot be
replaced. The transport does not follow redirects with credentials.

Only the authentication method is included in public connection settings. Custom
values stay in the encrypted MCP credential record and are redacted from echoed
results. Reopening the form shows empty editors: untouched fields retain the saved
configuration, while editing replaces both objects. Clearing chooses No authentication.
Changing the endpoint or authentication method requires credentials again. Updating
credentials invalidates discovered tool permissions until the connection is retested.
