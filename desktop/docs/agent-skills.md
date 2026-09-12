# Agent instructions and skills

`agent/instructions.md` contains the assistant's core boundaries and a short routing guide. Detailed workflows live in `agent/skills/*/SKILL.md` and are discovered by Harnest's managed ADK compiler.

The agent uses `list_skills` to find a matching descriptor, then `load_skill` with the returned id, source and version. It should load only the relevant guidance, adding another skill when the task changes.

- `browser-work`: observe controls, interact, verify results, recover from stalled steps.
- `login-recovery`: distinguish rejected credentials from failed interaction; avoid repeated submissions and unsupported diagnoses.
- `connected-tools`: discover enabled MCP schemas and select Fused integrations.
- `work-documents`: read context documents and create supported deliverables.
- `plan-work`: draft and execute explicitly approved plans.
- `report-results`: concise findings, evidence, and one specific next action when blocked.
- `structured-display`: the supported A2UI display catalog.

Approval and data boundaries remain in the core prompt and are enforced by the existing desktop/backend controls. Loading a skill does not grant permission. The Electron skill test exercises real Harnest discovery and loading with a fixture model; it verifies integration, not a guarantee that every model will consistently follow the guidance.

Rebuild the backend after changing skills. Restart Dextana to load the new backend; an already-running process retains its existing instructions.

## Personal skills

Use **Settings → Skills** to create or edit instructions, import a `SKILL.md`, toggle availability, or delete a personal skill. Imported files must include YAML `name` and `description` frontmatter; review the text before saving. This importer accepts the instruction document only, not supporting files or executable scripts.

Personal skills are stored in the backend's `settings.sqlite` and exposed through Harnest's dynamic `personal` source. The existing `list_skills` and `load_skill` tools discover them alongside bundled skills without an app rebuild. Enabled state and version are checked on every load; after an edit, the agent must refresh the catalog. Disabling a skill prevents future loads but does not remove instructions already present in an active chat. Skills never grant tool permissions.

Core instructions keep deliberation private and limit progress updates to meaningful findings, changed approaches, or blockers. Browser guidance also requires an observed reason for waiting and stops repeated reads of an unchanged page. Replies default to a short verified result, with detail when the task needs it.

Browser snapshots retain every page DOM element, including hidden/offscreen content, ordinary text containers, frames and shadow roots. `next_offset` and `next_text_offset` expose the remainder explicitly; `read` with `ref` returns full element text and attributes. Screenshots arrive as typed image media, with viewport dimensions for coordinate clicks. Hover, double-click and wheel actions use Chromium’s native input protocol. Frame refs route to their own isolated inspection contexts; frame geometry and hit testing keep clicks aligned with the displayed page. Nested action controls and covering overlays still receive normal browser hit testing. Site restrictions must be supported by page evidence, not inferred from a generic tool error.

Bundled skills use Harnest's `filesystem` source; `dextana` is the agent name, not a source. Initial discovery should omit the source filter. The `skill_sources` lifecycle hook resolves skill loads and checks explicit discovery source filters through the invocation-scoped Harnest registry. An unavailable source, skill, or version returns recovery guidance to the model, allowing the same turn to discover a valid descriptor. It does not alias sources, load a different skill, bypass version checks, or suppress provider failures. The integration regression deliberately submits `source="dextana"` and verifies discovery and loading can continue in the same run.

Live model behavior is evaluated separately in [browser-use evals](../evals/browser-use/README.md).
