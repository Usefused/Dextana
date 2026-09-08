# Message rendering

Assistant replies render Markdown automatically, including GFM tables, task lists,
strikethrough, fenced code and ordinary line breaks. User messages stay literal.
Web links open in the system browser through validated IPC. Raw HTML is displayed
as text; code is never executed. Images appear as links instead of loading remote
resources. File attachments and local `.md` file previews are not part of this change.

## A2UI display subset

A response may contain an `a2ui` fence, or a raw JSON object, JSON array, or JSONL
stream. The renderer supports the v0.9 envelope (`createSurface`,
`updateComponents`, `updateDataModel`, `deleteSurface`) and these display components:
Text, Row, Column, List, Card, Divider. Absolute JSON Pointer text bindings resolve
against the surface data model. JSONL updates render as each complete line arrives.
Each block/reply owns its own surfaces; updates across replies are not supported.

The supported catalog is `urn:dextana:display:1`. Basic v0.9 catalog messages using
only this subset also render. This is not a full A2UI client: actions, inputs,
functions, templates, themes, other protocol versions and transport negotiation
are not implemented. Unsupported components and malformed payloads show a notice
and retain their source. A source disclosure is also available for valid displays.

```a2ui
{"version":"v0.9","createSurface":{"surfaceId":"summary","catalogId":"urn:dextana:display:1"}}
{"version":"v0.9","updateComponents":{"surfaceId":"summary","components":[{"id":"root","component":"Card","child":"body"},{"id":"body","component":"Column","children":["title","status"]},{"id":"title","component":"Text","text":"Project summary","variant":"h2"},{"id":"status","component":"Text","text":{"path":"/status"}}]}}
{"version":"v0.9","updateDataModel":{"surfaceId":"summary","value":{"status":"Ready for review"}}}
```

References: [A2UI v0.9 protocol](https://a2ui.org/specification/v0.9-a2ui/)
and [react-markdown](https://github.com/remarkjs/react-markdown).

### File and website references

The Dext display catalog supports `Reference` with a `target` (file path or
HTTP(S) URL) and optional `label`. Both support JSON Pointer bindings. References
render compact file-type icons (PDF, Word, Excel, and other common formats) or a
website globe icon. Text components also recognize Markdown references, bare
web URLs, and common filenames. Web links use validated opening; local file
references are display-only and do not read or execute the file. Icons are
local SVGs, so displaying a reference makes no external favicon requests.
