# Compaction quality evaluations

Run the real production summarizer through Harnest's native ADK evaluation engine:

```sh
npm run eval:compaction
```

The defaults are `qwen3.5:cloud` for summarization and `deepseek-v4-flash:cloud` for judging, through the configured local Ollama daemon. Cloud-tagged models send these synthetic fixtures to their provider. No desktop transcript, saved settings, credentials database, browser or MCP tools are loaded. Configure another pair or a different Ollama endpoint explicitly:

```sh
npm run eval:compaction -- --base-url http://127.0.0.1:11434 --model qwen3.5:cloud --judge kimi-k2.6:cloud
npm run eval:compaction -- --case repeated_compaction
npm run eval:compaction -- --memory
```

The script stages an isolated Harnest agent in `.build/compaction-eval`, copying the production context, compaction-worker, budget, distillation and memory modules directly on every run. It invokes the same thinking filter, chunk summarization, reduction and incremental memory format as production. The adapter calls the summarizer directly so model failures fail the evaluation instead of being hidden by production's excerpt fallback. It does not evaluate the desktop trigger/cache mechanics; those have separate backend and Electron tests.

`--memory` tests the production shared personal-memory distillation worker on eligible histories (up to 96 KB), with the same production chunked fallback for larger histories. It uses an ephemeral SQLite database and synthetic owner. Distillation errors fail the eval rather than silently falling back. Both modes keep the strict metric thresholds.

Eight scenarios cover latest corrections, action receipts, facts buried in a large result, thinking removal, hostile page instructions, exact references, three successive compactions, and contradictory payment evidence. Expected identifiers and case rubrics are given only to evaluators. Later compaction rounds receive previous generated memory plus new records, never the original lost history or expected answer.

## Metrics and acceptance

Every case must pass all four metrics; successful cases must not compensate for failed cases.

| Metric                                   | Type               | Required result                                                                                 |
| ---------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------- |
| `compaction_exact_identifiers`           | Custom             | All required IDs, paths, URLs and exact names retained                                          |
| `compaction_no_leaks`                    | Custom             | No reasoning tags or seeded reasoning/injection canaries                                        |
| `compaction_compactness`                 | Custom             | Nonempty, at most 6 KB; the large-result case also requires at most 5% of source size           |
| `rubric_based_final_response_quality_v1` | Built-in ADK judge | All applicable faithfulness, correction, action-status and case-specific requirements satisfied |

Each case generates one summary (or one sequence of summaries for repeated compaction). The judge samples each final response three times; ADK aggregates the rubric votes. `--samples 1` provides a quicker exploratory run, not equivalent confidence to the default. Using a different judge reduces dependence on a single model's judgments. The judge rubric explicitly identifies the fixture records as historical evidence; the summarizer is not expected to execute those tools again. This avoids confusing a historical receipt with an unsupported claim of live execution. The judge checks meaning and statuses: literal identifier matching alone cannot detect an invented approval or a reversed correction.

Native JSON reports and a companion manifest are written under `.build/eval-results/compaction/`. The manifest records models, judge sample count, selected cases, and SHA-256 hashes of the production code, fixture set and metric configuration. Harnest distinguishes scored failures from execution errors; either exits nonzero. Inspect per-case and per-rubric failures before changing a threshold or prompt. A pass supports these scenarios, not arbitrary-history reliability; extend the suite when real failures occur.

## Validate the evaluation code without model calls

```sh
npm run eval:compaction -- --check
npm run eval:compaction -- --prepare-only
```

The check runs authored metric tests through Harnest, including missing/near-matching IDs, reasoning leaks, empty output, copied history, UTF-8 size accounting, and incremental adapter isolation. These tests validate the evaluation machinery and are not a summary-quality result.

The first environment sync creates the target's profile lock; it is saved beside this README. Subsequent runs use the frozen lock. Dependency files and locks belong only to the eval target and do not modify Dextana's production runtime.

The judge uses a Harnest model lifecycle hook to discard provider reasoning fields before ADK parses rubric verdicts. Final verdict text is preserved verbatim; malformed verdicts are not repaired, and negative verdicts remain negative. A dedicated regression test checks this boundary.

Harnest’s eval profile currently resolves LiteLLM 1.85.7 because its Vertex evaluation dependency requires a version below 1.86; Dextana’s runtime lock uses 1.100.0. The production summarizer source and prompts are identical, but this suite does not establish dependency-identical desktop behavior. The manifests record both lock hashes; production integration tests cover the desktop transport separately.

Latest measured results and implementation changes: [improvements](IMPROVEMENTS.md).
