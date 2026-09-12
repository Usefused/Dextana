# Compaction improvements — 9 September 2026

The initial baseline passed 5/8 cases. The revised summarizer passed all eight cases in both tested paths:

| Production path | Passed | Failed | Judge samples per case |
| --- | ---: | ---: | ---: |
| Chunked session compactor | 8 | 0 | 3 |
| Shared personal-memory distillation, with large-history fallback | 8 | 0 | 3 |

Both runs use `qwen3.5:cloud` as summarizer and `deepseek-v4-flash:cloud` as judge. Exact-reference, leak, compactness and semantic thresholds remain 1.0. Fixtures and expected references are unchanged. The semantic rubric now explicitly tells the judge that the supplied records are historical evidence; the summarizer is not supposed to re-execute those tools. One exploratory run incorrectly rejected a documented historical receipt because the summarizer made no live tool calls. This rubric clarification is recorded in the manifest, so the two runs should not be described as having byte-identical evaluator configuration to the baseline.

## Production changes

- Chunk envelopes carry record identity, fragment index and total fragment count. The reducer must combine positive evidence and cannot interpret an absent fact in one fragment as a failed read.
- Instructions require verbatim business references, preserve uncertainty and exclude irrelevant attack commentary. A separate editorial pass reviews outputs that still discuss source instructions. This is a quality measure, not a security guarantee.
- The shared distillation worker uses the same improved instructions and review. Versioned caches avoid reusing summaries created under older instructions.
- The trigger uses deployment context metadata and reserves response space and a safety margin. Tools, images and recalled memory are included before the check. An independent byte guard remains for unknown compatible aliases.
- Restored history is injected as separate historical messages from the session namespace. It can be compacted on the first request after interruption, while the current owner message remains intact.
- Cached prefix and result summaries are applied before checking whether more compaction is necessary. Saved transcripts remain unchanged.

## Evidence

Final validation: 94 backend tests and all four targeted Electron integration tests passed. The app build and compiled backend completed successfully.

- [Session-compactor Harnest report](../../.build/eval-results/compaction/2026-09-09T10-54-31.625Z.json) and [manifest](../../.build/eval-results/compaction/2026-09-09T10-54-31.625Z.manifest.json).
- [Personal-memory Harnest report](../../.build/eval-results/compaction/2026-09-09T10-56-44.729Z.json) and [manifest](../../.build/eval-results/compaction/2026-09-09T10-56-44.729Z.manifest.json).
- Backend regressions cover actual allocation versus architectural maximum, compatible catalog limits, unknown aliases, restored-history compaction below the old threshold, cache reuse and fragment provenance.
- Electron tests cover near-limit triggering, saved-summary reuse after restart, cancellation recovery, message editing, compatible endpoints and personal memory.

These are eight synthetic scenarios per path, with one generated trajectory per scenario, not a claim of universal reliability. Earlier scored failures remain in the report directory and initial baseline document. Token counts for arbitrary model aliases are estimates. Providers that expose no usable context metadata retain a byte guard rather than an invented token limit.
