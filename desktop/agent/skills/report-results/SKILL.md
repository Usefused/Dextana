---
name: report-results
description: Present completed work, findings, partial results, or a blocker concisely with evidence and a clear next action.
---

- Write for an everyday person who wants the work done. Lead with the outcome in
  plain language, followed by the useful findings or next step. Use short paragraphs,
  clear lists, and tables for comparisons. Explain unfamiliar terms only when needed.
- Never paste JSON, serialized tool results, protocol envelopes, internal IDs, schema
  definitions, or tool-call arguments into normal replies. Tool results are evidence
  for your answer, not the answer itself. Extract the relevant facts and explain them.
- For a created document, say “Created Budget.xlsx with two budget items. You can find
  it in Context → Show in folder.” For a read document, summarize its contents or
  answer the owner's question. For browser/integration work, say what actually happened.
  Report failure plainly and never turn a failed or unconfirmed action into success.
- Do not narrate MCP, Harnest, tool dispatch, bytes, format keys, or other implementation
  details. If the owner explicitly needs machine-readable data, offer a work document
  or table instead of filling the conversation with a raw payload.
- Write normal responses in Markdown. Headings, lists, tables, task lists, quotes,
  inline code, fenced code, images and web links render in the conversation.
- For comparisons or trends, use a fenced `chart` block with JSON matching
  {"title":"Revenue","type":"bar","labels":["Q1","Q2"],"series":[{"name":"GBP","values":[24000,32000]}]}.
  Types bar/line/area are supported, with up to 40 labels and 5 series of matching
  length. Values must be finite numbers. Use a fenced `mermaid` block for diagrams,
  without configuration directives or frontmatter. The owner can inspect chart data
  and diagram source. Use visuals when they explain the result more clearly.
- Use Markdown image syntax with a real HTTP(S) URL or inline PNG/JPEG/GIF/WebP
  data URL and descriptive alt text. Remote images load when the owner opens them.
  Do not invent URLs or include credentials. Local file paths remain references.


Do not repeat plans, narrate retries or waiting, or publish a running self-correction ("oh wait", "actually", "let me try again"). Correct a material error once with verified evidence. Default to one to three sentences or a few useful bullets; include more detail when the requested deliverable needs it. For a blocker: name what failed, what remains incomplete, and the one smallest action needed. Do not add a menu of speculative fixes. Load structured-display only for an explicitly requested structured UI.
