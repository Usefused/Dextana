---
name: structured-display
description: Ask interactive clarification questions or render a requested structured display using the supported A2UI catalog.
---

For clarification during work, prefer ask_questions: it uses this same question
card and returns the owner's answer directly to the calling agent. Delegated
workers MUST use ask_questions so the main chat sees the question immediately;
do not emit a fenced question as a worker's final result. Other workers continue
while the asking worker waits. Questions do not approve tool use or plans.

For a requested structured display or a question in a completed owner-chat reply, emit a fenced `a2ui`
  block containing A2UI v0.9 JSONL messages. Each block is an independent surface
  session. Use createSurface with catalogId "urn:dextana:display:1", then
  updateComponents with a component named "root". Supported display components:
  Text (text string or {"path":"/absolute/path"}, optional variant h1-h5/body/caption),
  Reference (target file path or HTTP(S) URL, optional label; both allow data bindings) displays a file or website icon. Use it for cited files and links.
  Column/Row/List (children array of component IDs), Card (child component ID),
  Divider. Text bodies support Markdown emphasis, lists and links.
  Table (title, columns: string[], rows: scalar[][]), Chart (title, type: bar/line/area,
  labels: string[], series: [{name: string, values: number[]}]), Image (src: HTTP(S)
  URL or inline PNG/JPEG/GIF/WebP data URL, alt), Diagram (source: Mermaid text).
  Table columns/rows, Chart labels/series, Image src/alt and Diagram source can use
  {"path":"/absolute/path"} data bindings. Charts allow up to 40 categories and 5
  series; every series must match the labels in length. Tables allow 30 columns
  and 1,000 rows. Use only finite numbers for chart values.
  updateDataModel supports JSON Pointer paths and deleteSurface removes
  a surface. Use one complete JSON object per line.
- QuestionForm (title, questions array) collects live answers and sends them as a
  normal user reply in this chat. Each question has a unique id, prompt, type
  (text, single, multiple), and optional required (defaults to true). Choice
  questions include options: [{id, label, description?}]. IDs contain only letters,
  numbers, underscores and hyphens. Single means one selection; multiple means
  checkboxes. Every choice question also allows a custom written answer.
  Written answers use a single-line input by default. Set `multiline: true` on a
  question only when a longer explanation or multiple lines are needed.
  Use one QuestionForm per assistant message with one to six related questions,
  up to twelve options each. Keep titles under 160 characters, prompts under 500,
  option labels under 120, and descriptions under 240. Do not preselect answers.
  Finish your response after asking and wait. The form becomes available when the
  response finishes; submitted and older forms cannot send again. Do not follow
  a question with tools that depend on the answer.
- QuestionForm's Send reply is the only supported form action. It does not grant
  tool permissions, approve a plan, or execute a URL, callback or arbitrary action.
  Use the existing permission and plan tools for approvals. Never request passwords,
  tokens or payment details through a question card. No custom functions or collection
  templates are supported. Use Markdown for anything outside this catalog.
- Remote images load only when the owner opens their preview. Use meaningful alt
  text. Never invent an image URL or include credentials in one. Local file paths
  belong in Reference components, not Image. Diagrams cannot include configuration
  directives, frontmatter or scripts.

Example chart component:
`{"id":"revenue","component":"Chart","title":"Revenue","type":"bar","labels":["Q1","Q2"],"series":[{"name":"GBP","values":[24000,32000]}]}`

Example interactive question (emit the complete fenced block):

```a2ui
{"version":"v0.9","createSurface":{"surfaceId":"report-preferences","catalogId":"urn:dextana:display:1"}}
{"version":"v0.9","updateComponents":{"surfaceId":"report-preferences","components":[{"id":"root","component":"QuestionForm","title":"Tailor your report","questions":[{"id":"audience","prompt":"Who is this report for?","type":"single","options":[{"id":"team","label":"My team"},{"id":"leadership","label":"Leadership"}]},{"id":"sections","prompt":"Which sections should I include?","type":"multiple","options":[{"id":"summary","label":"Summary"},{"id":"metrics","label":"Key metrics"}]},{"id":"notes","prompt":"Any other requirements?","type":"text","required":false}]}]}}
```
