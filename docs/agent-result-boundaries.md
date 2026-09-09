# Agent result and context audit

Dextana-owned metadata must be projected before it reaches the model. Chat and A2UI renderers preserve values; they do not infer private columns from headings or strip UUID-shaped business data.

| Surface | Model-facing contract |
| --- | --- |
| Downloads | Filename, state, byte counts, saved path and status message; no transfer/activity/tab bookkeeping inside receipts. |
| Scheduled jobs | Explicit schedule details and a durable public reference; no database, source-chat, native task or run IDs. |
| Timers and reminders | Alarm reference, title, state and timing; no owning chat, request IDs or notification occurrence counters. |
| Folder watches | Watch reference and useful configuration/status; no owning chat or internal file fingerprints. |
| Rename previews and history | Rename reference and from/to/outcome entries; no owning chat or file identity fingerprints. |
| Processing | Processing reference, inputs, output path and status; no owning chat. |
| Computer use | Window/observation references and the observed UI content; no process IDs, native window IDs or duplicate raw snapshot IDs in result envelopes. |
| Browser tabs | Chat-scoped tab references, titles and URLs. Page content and element references remain usable. |
| MCP and Fused catalogs | Named connection references and tool schemas. External service result payloads remain unchanged. |
| Plan submission and worker results | Plan status/message and worker position/model/status/result; no plan/message/child activity IDs. |
| Saved and approved plans | Steps and useful scope details; no plan IDs, connector revisions, fingerprints or parent-directory identity values. |
| Work context | Names, locations and state; file-open uses a scoped file reference. Desktop context omits its stored resource key and synthetic internal location. |
| Personal memory | Fact text and its update time. Source-chat/message IDs, scope and storage keys stay local. The memory updater also omits provenance while retaining the semantic fact keys needed for corrections. |
| Personal skills | Unique validated skill name with a personal namespace and a modification timestamp as version. Storage IDs/revision UUIDs remain local. |

`agent/lib/tool_receipts.py` is applied at the backend client-tool boundary and when constructing new context/plan prompts. Desktop results use explicit contracts in `desktop_receipts.py`. References are mapped only in known routing fields; arbitrary nested values are never rewritten. The mapping is stored with the chat and committed before sending the result to the runtime. References survive restart, do not collide on duplicate resource names, and are not reused for different resources. Resolving a reference does not bypass the owning service's chat scope, freshness checks, or approval requirements. Older tool calls with storage handles remain compatible.

Schedule references are persisted separately in the scheduler's SQLite database. Personal skill names are unique; changing a skill name or version requires catalog refresh. Download receipts additionally use an explicit projection in the Electron download manager.

Execution tickets remain inside authored MCP/desktop tool code and the approval transport; they are not final model tool results. Owner-facing controls still retain internal identifiers for routing. MCP approvals use named targets and actual proposed arguments. Files return document content and file facts. Generic Markdown and A2UI rendering stays lossless, including legitimate customer/document IDs supplied by external systems or the owner.

This change does not rewrite old conversations, cached tool history, user-provided content, or arbitrary prose from a model or external service. It is a contract boundary for structured Dextana data, not a promise that no identifier can ever appear in chat. New desktop operations must provide a reviewed result contract; unknown results are withheld with an instruction to inspect the outcome before retrying.

Regression coverage includes backend contract tests with added unknown metadata, reference round trips and reloads, unchanged business IDs, and Electron checks for timer management across restart, download/A2UI rendering, tab targeting, MCP invocation, plan approval, personal skills and memory recall.

## Follow-up scan: error reporting

Native computer-use calls no longer forward raw driver error text or rejected-call messages. Inspection failures explain how to reselect the window/check permissions; unverified input results explicitly require checking the window before another attempt. Native startup, window listing and session setup use readable errors too. Original diagnostic errors remain attached as local exception causes, while tool results and UI handlers consume only the public message. Cancellation continues to propagate as cancellation.

Structured runtime failure events expose only their message, not the surrounding request/session metadata. Runtime HTTP failures expose the HTTP status without the session URL; connection failures use a connection message. Ordinary provider error messages and business content are not subjected to UUID pattern filtering.

The follow-up scan found no additional direct storage-record rendering in current approval details or chat components. Existing saved replies and runtime history remain unchanged. Regression checks cover injected native errors containing session/snapshot identifiers, cancellation, structured runtime envelopes, and HTTP failures with UUID-bearing session URLs.
