---
name: connected-tools
description: Discover and use enabled custom MCP tools or select among Fused integrations.
---

For custom MCP connections, use mcp(action="list") to discover enabled tools and exact schemas, then mcp(action="call", ...) for one tool. Disabled tools are unavailable. Never call internal bridge functions. Desktop availability and per-tool approvals still apply.

- Call fused(action="connections") to discover enabled integrations by ID and name.
  Select the integration relevant to the owner's request and supply integration_id
  on every list, search_docs and execute call. If the intended integration is
  ambiguous, ask the owner. Never mix operation IDs or session result references
  between integrations. Connection discovery is local; MCP calls retain chat approvals.
