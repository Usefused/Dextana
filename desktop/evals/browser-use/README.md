# Live browser-use evals

These evals run the selected real Ollama model through Dextana's compiled Harnest agent, Electron approval flow, and shipped browser extension. The model proxy forwards responses unchanged and records tool choices. There is no scripted model response or tool-choice override in this suite.

## Run

Start Ollama with access to the desired model, then run:

```sh
npm run eval:browser-use
```

Defaults: `qwen3.5:cloud`, `http://127.0.0.1:11434`, two samples of each scenario. Cloud models send the synthetic task and tool descriptions to the configured model provider.

Optional environment variables:

- `DEXTANA_EVAL_MODEL`: exact model name listed by Ollama.
- `DEXTANA_EVAL_BASE_URL`: Ollama endpoint.
- `DEXTANA_EVAL_REPEATS`: samples per case.
- `DEXTANA_EVAL_CASE`: one ID from `cases.ts`.

Each sample creates a new chat. Each worker uses a disposable Electron profile; each sample uses a disposable Chromium profile with the real extension. A local HTTP server serves the synthetic inbox, external DNS is disabled in the test browser, and approvals reject navigation outside the fixture origin. The new-tab task explicitly supplies the local inbox URL. No personal browser profile, account, or mail is used. Playwright supplies owner approval for browser actions only and activates default browser-wide access to the synthetic tabs. The empty-connection case opts into granular mode with no tabs selected. Each sample explicitly stops the connection during teardown to prevent activation leaking into the next sample. An in-app approval after an external-browser request fails the eval without executing that action.

## What is measured

- Whether the model's first browser action is `connect_user`, separately from desktop routing recovery.
- Whether the connection is requested and attached through the actual approval/dialog/extension flow.
- Whether an explicit inbox task returns the synthetic newest subject.
- Whether these behaviors survive a real preceding in-app turn, an explicit correction, and a connection with zero selected tabs requiring a new task tab.
- Actual model calls, tool results, final answer, runtime status/error, and source/build hashes.

The ambiguous original Zoho request passes when the model connects and completes its turn; asking what to do in Zoho is appropriate. The explicit task cases additionally require the observed inbox subject. A wrong initial browser choice is reported independently even if the desktop routing guard recovers it.

Results are written to `.build/eval-results/browser-use/`; retained failure traces are under `traces/`. Each target turn has a 130-second deadline and each sample has a 30-model-request budget. Setup/model/transport failures must be distinguished from agent behavioral failures. Reports include provider metadata lookup errors as well as chat request errors; inspect the requested endpoint/model before attributing these to inference.

This is a small behavioral regression suite, not a general computer-use benchmark. Synthetic pages do not establish reliability on real Zoho, authenticated sites, cross-origin frames, or arbitrary desktop applications. The ordinary `agent-skills.spec.ts` and `user-browser.spec.ts` suites use scripted models and establish integration contracts rather than autonomous model behavior.
