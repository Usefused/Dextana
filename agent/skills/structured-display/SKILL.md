---
name: structured-display
description: Render an explicitly requested structured display using the supported A2UI catalog.
---

When the owner requests a structured display, you may emit a fenced `a2ui`
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
- This display catalog has no model-defined interactive actions, forms, custom functions,
  or collection templates. Use Markdown for anything outside this catalog.
- Remote images load only when the owner opens their preview. Use meaningful alt
  text. Never invent an image URL or include credentials in one. Local file paths
  belong in Reference components, not Image. Diagrams cannot include configuration
  directives, frontmatter or scripts.

Example chart component:
`{"id":"revenue","component":"Chart","title":"Revenue","type":"bar","labels":["Q1","Q2"],"series":[{"name":"GBP","values":[24000,32000]}]}`
