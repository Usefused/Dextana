# Reasoning controls

The shared chat selector checks reasoning support against the saved model connection.
Ollama uses `/api/show`; compatible providers use their authenticated `/models` catalog.
Credentials stay in the main process.

OpenRouter's per-model `reasoning.supported_efforts` determines available slider steps,
including minimal, xhigh and max when advertised. Mandatory reasoning hides Off.
Default leaves the provider's own configuration untouched. Older catalogs advertising
`reasoning` or `reasoning_effort` expose conservative low/medium/high choices. A catalog
with only model IDs shows “This provider does not report reasoning controls,” instead
of claiming that the model cannot reason.

Requests use Ollama's `think`, OpenRouter's unified `reasoning` object, or the compatible
provider's `reasoning_effort` field. Explicit selections override the corresponding
body option while preserving custom authentication fields. Selecting another model
resets effort, and stale unsupported values reset to the new model's default.

Sources: https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
