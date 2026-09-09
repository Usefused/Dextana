# Personal memory

Dextana can remember useful details across chats. In Settings → Models, fetch
models from your connection, select an embedding model from the dropdown and
save. Discovery reuses the chat model catalog and identifies embedding models
from capabilities, task metadata or recognizable IDs. If a provider omits an
embedding model from its catalog, choose “Enter a model ID manually…”.
Dextana sends a small test embedding request using that connection. A
missing or unsupported embedding model disables personal memory while chat and
ordinary context compaction remain available. Selecting “Disabled” disables
capture and recall; existing memories stay on disk.

After a successful owner turn, a private, tool-free Harnest worker uses the
selected chat model to produce **both a conversation summary and personal
facts**. It reuses the same connection resolution, credentials, worker runner,
thinking removal and context limits as existing compaction. Facts are limited to
durable user statements, preferences and decisions, with stable keys for
corrections and explicit forgetting. Summaries preserve execution context;
personal facts do not establish permissions or authorize actions.

Before a new turn, memory embeds the request and supplies up to six relevant
facts, with sources and dates. The initial implementation uses normalized
vectors and cosine similarity in Python, with a relevance threshold of 0.3.
It scans the local user's memories and needs no vector database service or new
package. This is intended for a personal desktop corpus, not a large shared
knowledge warehouse. Embedding calls time out; unavailable recall is reported in
the activity events and does not fail the chat.

## Shared work and persistence

Completed-turn summaries are cached using exact record fingerprints. Compaction
can combine cached summaries only when they cover every record, including tool
calls/results. New short compaction inputs use the same summary-plus-memory
worker and cache; large inputs retain the existing bounded chunking fallback.
Changed or uncovered records are never represented by a stale summary.

Capture jobs are committed before dispatch, run one at a time in the background,
and resume after restart when memory is enabled. Each job has at most three
attempts; failures are retried on a later turn. A new fact becomes available once
capture finishes (the activity reports “Personal memory updated”). Enabling the
feature does not bulk-import old chats. Older material may be learned when it
passes through compaction. Processing unusually large turns can exceed the
worker budget; the transcript remains saved and the activity reports failure.

All memory tables live in the existing `activities.sqlite`, using
`ActivityState.connect()` for private WAL transactions. Model calls never occur
inside database transactions. Jobs store transcript records, not credentials.
Finished jobs retain their idempotency receipt and discard their record copy.
Editing a source message invalidates its jobs and facts, including in-flight
writes. Explicit forgetting and source edits retain empty tombstones so older
work cannot restore a superseded fact. Undated compaction facts can fill gaps but
cannot overwrite newer owner statements.

Embedding caches are keyed by provider, endpoint, model and dimensions. Changing
any of these rebuilds missing vectors from saved facts in batches. Keys are
resolved through the existing encrypted model-connection store. Embedding model
validation never returns provider error bodies or credentials to the renderer.
Facts are stored locally; selected remote models receive the text needed for
extraction or embeddings. Those calls can incur provider charges.

## Moving the component

- `agent/lib/memory.py`: SQLite facts, capture queue, vector search and updates.
  Standard library only; accepts a transactional connection factory and async
  `embed(texts)` / `extract(records, existing)` functions. The owner and optional
  scope are explicit arguments.
- `agent/lib/distillation.py`: shared summary/fact worker output and exact-record
  cache, using Dextana's existing `compaction_agent.compact_records` runner.
- `agent/lib/embeddings.py`: one transport for runtime embedding and connection
  validation, supporting `/embeddings` and Ollama `/api/embed`.
- `agent/lib/memory_runtime.py`: Dextana adapter. It connects activity start/end,
  model context, settings changes, message edits and shutdown to the component.
  Dextana uses its existing authenticated `owner` identity and global scope.
- `src/renderer/MemorySettings.tsx`: embedding selection and feature status.

To reuse the core in another host, copy `memory.py`, inject that host's SQLite
transaction factory and model functions, and call `recall` before a turn and
`enqueue` / `capture` after it. Reuse `Distillation` when the host also needs
conversation summaries; adapt its worker import to that host's text worker.

## Checks

`harnest test agent` covers persistence, owner/project isolation, corrections,
forgetting, edited-source races, malformed vectors, embedding changes, bounded
retries, provider validation, and shared summary reuse. The desktop memory test
uses a local fixture provider and real Electron/Harnest execution to check
cross-chat recall after restart, correction, credentials, and disabling an
unsupported embedding model without disabling chat.
