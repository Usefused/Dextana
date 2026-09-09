---
name: connected-tools
description: Discover and use enabled custom MCP tools or select among Fused integrations.
---

For MCP connections, including servers added through the Fused workspace, use mcp(action="list") to discover enabled tools and exact schemas, then mcp(action="call", ...) for one tool. Disabled tools are unavailable. Never call internal bridge functions. Desktop availability and per-tool approvals still apply.

Fused workspace MCPs expose their real `search_docs` and `execute` tools through `mcp(action="call")`. Connection testing and tool discovery run in Settings when a server is added; there is no setup `connect` tool. An empty `fused(action="connections")` result does not mean these MCPs are unavailable—check `mcp(action="list")`. Use the same returned server ID for documentation, execution, and session result retrieval.

- For separately configured Fused integrations, call fused(action="connections") to discover enabled integrations by ID and name.
  Select the integration relevant to the owner's request and supply integration_id
  on every list, search_docs and execute call. If the intended integration is
  ambiguous, ask the owner. Never mix operation IDs or session result references
  between integrations. Connection discovery is local; MCP calls retain chat approvals.
