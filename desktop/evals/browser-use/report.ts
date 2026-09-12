import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { ModelTrace } from './model-proxy';
import type { drive } from './driver';
import type { cases } from './cases';
export function createReport(
  scenario: (typeof cases)[number],
  repetition: number,
  started: string,
  model: string,
  trace: ModelTrace,
  offset: number,
  result: Awaited<ReturnType<typeof drive>> | undefined,
  failure: string,
) {
  const calls = trace.calls.slice(offset);
  const browserCalls = calls.filter((call) => call.name === 'browser');
  return {
    scenario: scenario.id,
    repetition,
    model,
    started,
    prompt: scenario.prompt,
    history: scenario.seed ? 'live model opened an in-app fixture before correction' : 'fresh chat',
    directExternalChoice: browserCalls[0]?.arguments.action === 'connect_user',
    firstBrowserAction: browserCalls[0]?.arguments.action,
    ...outcome(result),
    calls,
    failure,
    transportErrors: trace.errors,
    actualModels: trace.models,
    toolResults: trace.results,
    requests: trace.requests,
    inputTokens: trace.inputTokens,
    outputTokens: trace.outputTokens,
  };
}
export async function persistReport(report: ReturnType<typeof createReport>) {
  const sources = [
    '.build/backend/build.json',
    '.build/backend/agent/source/instructions.md',
    'agent/agent.py',
    'agent/instructions.md',
    'agent/lifecycle/skill_sources.py',
    'agent/tools/browser.py',
    'agent/skills/browser-work/SKILL.md',
    'src/main/user-browser/routing.ts',
    'src/main/user-browser/connection.ts',
    'src/main/user-browser/index.ts',
    'browser-extension/control-session.js',
    'browser-extension/control-worker.js',
    'browser-extension/control-tabs.js',
    'src/main/local-capabilities.ts',
  ];
  const hashes = Object.fromEntries(
    await Promise.all(
      sources.map(async (path) => [
        path,
        createHash('sha256')
          .update(await readFile(path))
          .digest('hex'),
      ]),
    ),
  );
  await mkdir('.build/eval-results/browser-use', { recursive: true });
  await writeFile(
    `.build/eval-results/browser-use/${report.started.replaceAll(':', '-')}-${report.scenario}-${report.repetition}.json`,
    JSON.stringify({ ...report, sources: hashes }, null, 2),
  );
}

function outcome(result: Awaited<ReturnType<typeof drive>> | undefined) {
  if (!result)
    return {
      connected: false,
      completed: false,
      subjectVerified: false,
      final: '',
      runtimeError: undefined,
    };
  const final =
    result.state.messages.filter((item) => item.role === 'assistant').at(-1)?.content ?? '';
  return {
    connected: result.attached,
    completed: result.state.status === 'completed',
    subjectVerified: final.includes('September planning review'),
    final,
    approvals: result.approvals,
    events: result.state.events,
    status: result.state.status,
    runtimeError: result.state.error,
  };
}
