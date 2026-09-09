# Browser behavior eval — 9 September 2026

The final `qwen3.5:cloud` batch passed **8/8** cases through the production Harnest/Electron/extension path. Every case chose `browser(action="connect_user")` as its first browser call. Both explicit correction tasks and both autonomous new-tab tasks read the correct synthetic newest-email subject.

| Scenario                                                 | Samples | Connected and completed | Correct first browser action | Required inbox answer |
| -------------------------------------------------------- | ------: | ----------------------: | ---------------------------: | --------------------: |
| Original “use the zoho on my browser” wording            |       2 |                     2/2 |                          2/2 |          Not required |
| Same request after a real in-app turn                    |       2 |                     2/2 |                          2/2 |          Not required |
| “Not inapp. My computer use browser” with an inbox task  |       2 |                     2/2 |                          2/2 |                   2/2 |
| Zero attached tabs; create an external task tab and read |       2 |                     2/2 |                          2/2 |                   2/2 |

**Skill selection still required recovery in 5/8 runs (six failed lookups).** The model invented source names or version hashes. Harnest's scoped skill API rejected them; the lifecycle hook returned recovery guidance instead of terminating the run. The model then used valid descriptors and continued. This is evidence that runtime recovery matters, not evidence that the model consistently follows discovery instructions unaided.

## Failures that led to the fix

- A live run with the original user wording called `load_skill(name="browser-work", source="dextana")` and failed with the user's exact error. `dextana` is the agent name; bundled skills use `filesystem`.
- Explicitly telling the model to discover sources first did not prevent that failure in the next live pilot.
- Source-only recovery passed 7/8 in the first full batch. A fabricated skill version still terminated one explicit-correction run.
- Recovery now covers unavailable sources, names, and versions using the public invocation-scoped Harnest skill API. It retains version pins, source scope and personal-skill authorization, and propagates provider failures.

Initial harness synchronization errors and an intermediate hook API error were debugging failures; they are excluded from model success-rate claims. Their raw local reports remain in `.build/eval-results/browser-use/`.

## Evidence and limits

[Per-sample results](results/2026-09-09.json) record actual model calls, final answers, compiled-backend/source hashes, original trace paths and pass criteria. [Run instructions](README.md) describe how to repeat the suite. The final batch ran between 14:37 and 14:40 UTC, with 422,436 provider-reported input tokens and 4,601 output tokens, including setup turns.

The test browser uses a local synthetic inbox and an isolated profile. Owner approvals are supplied by the harness; the actual model chooses the tools. Only fixture-origin navigation is approved and external DNS is disabled. The autonomous-tab case supplies the local test-inbox URL explicitly. Earlier development trials used HTTPS interception; the final fixture removes a first-navigation interception race on newly created tabs. Consequently the autonomous-tab prompt differs slightly from the earlier batch, while the original wording and correction cases retain their prompts.

Eight samples are a regression check, not a broad reliability estimate. These results do not establish performance on real Zoho, arbitrary authenticated sites, multi-frame pages, or general native computer use. Provider metadata probes for `qwen3.5:latest` returned 404; recorded inference requests all used `qwen3.5:cloud` successfully.

Additional verification: 112 backend tests passed; three real Harnest skill discovery/recovery integration tests passed; the default extension fixture's trusted input/stale-reference/stop test passed. App and eval TypeScript checks and the app build passed. All 58 checked TypeScript functions and both skill-hook Python functions met the maximum complexity of 10. The build's existing large-chunk warning remains.

## Browser-wide activation follow-up

The 15:26–15:29 UTC batch passed **8/8** real `qwen3.5:cloud` samples with the updated skill and extension. Every sample selected `connect_user` first and completed. All four required inbox tasks returned the correct synthetic subject. The six nonempty scenarios activated the default browser-wide grant; both autonomous-tab samples used optional granular mode with zero selected tabs. No case required a scripted model response or wrong-tool routing recovery.

[Full per-sample reports](results/2026-09-09-browser-wide.json) retain model calls, results, approvals, source/build hashes and local trace paths. The batch made 51 provider requests with 420,466 reported input tokens and 4,492 output tokens. The final Context reconciliation adjustment was verified separately through the integration suite; these model results measure browser selection and task completion, not Context rendering.

Connection durability is covered by real-extension integration checks: activation with thirteen tabs, future-tab discovery, cross-chat reuse, trusted input, temporary transport interruption and service worker restart. These do not establish persistence across a full Dextana quit/restart, which still requires activation. The original benchmark limitations above continue to apply.
