import { cp, copyFile, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { cases, evalSet } from '../evals/compaction/cases.mjs';

const { values } = parseArgs({
  options: {
    model: { type: 'string', default: process.env.DEXTANA_EVAL_MODEL || 'qwen3.5:cloud' },
    judge: { type: 'string', default: process.env.DEXTANA_EVAL_JUDGE || 'deepseek-v4-flash:cloud' },
    'base-url': {
      type: 'string',
      default: process.env.DEXTANA_EVAL_BASE_URL || 'http://127.0.0.1:11434',
    },
    case: { type: 'string' },
    samples: { type: 'string', default: '3' },
    check: { type: 'boolean', default: false },
    memory: { type: 'boolean', default: false },
    'prepare-only': { type: 'boolean', default: false },
  },
});
const samples = Number(values.samples);
const endpoint = new URL(values['base-url']);
if (
  !['http:', 'https:'].includes(endpoint.protocol) ||
  endpoint.username ||
  endpoint.password ||
  endpoint.search ||
  endpoint.hash ||
  /\/v1\/?$/.test(endpoint.pathname)
) {
  throw new Error(
    '--base-url must be a native Ollama endpoint, not an OpenAI-compatible /v1 endpoint',
  );
}
if (!Number.isInteger(samples) || samples < 1 || samples > 5)
  throw new Error('--samples must be 1–5');
const selected = values.case ? cases.filter((test) => test.id === values.case) : cases;
if (!selected.length)
  throw new Error(`Unknown case. Available: ${cases.map((test) => test.id).join(', ')}`);
const root = fileURLToPath(new URL('../', import.meta.url));
const template = join(root, 'evals/compaction');
const stage = join(root, '.build/compaction-eval');
// Playwright clears test-results at startup, including during other tasks.
const reports = join(root, '.build/eval-results/compaction');
await mkdir(stage, { recursive: true });
await mkdir(reports, { recursive: true });
await cp(template, stage, { recursive: true });
await copyFile(join(root, 'agent/harnest.lock'), join(stage, 'harnest.lock'));
const hashes = {};
const evaluationHashes = {};
for (const name of ['agent.py', 'lib/compaction_metrics.py', 'lib/judge_model.py']) {
  evaluationHashes[name] = createHash('sha256')
    .update(await readFile(join(template, name)))
    .digest('hex');
}
for (const name of ['model_context.py', 'compaction_agent.py', 'context_budget.py', 'distillation.py', 'memory.py']) {
  const source = join(root, 'agent/lib', name);
  await copyFile(source, join(stage, 'lib', name));
  hashes[name] = createHash('sha256')
    .update(await readFile(source))
    .digest('hex');
}
const dataset = JSON.stringify(evalSet(selected), null, 2);
await writeFile(join(stage, 'evals/compaction.evalset.json'), dataset + '\n');
const config = JSON.parse(await readFile(join(stage, 'evals/test_config.json'), 'utf8'));
config.criteria.rubric_based_final_response_quality_v1.judge_model_options.num_samples = samples;
await writeFile(join(stage, 'evals/test_config.json'), JSON.stringify(config, null, 2) + '\n');
const runId = new Date().toISOString().replaceAll(':', '-');
const output = resolve(reports, `${runId}.json`);
await writeFile(
  output.replace('.json', '.manifest.json'),
  JSON.stringify(
    {
      startedAt: new Date().toISOString(),
      model: values.model,
      judge: values.judge,
      endpoint: endpoint.href,
      judgeSamples: samples,
      memoryDistillation: values.memory,
      cases: selected.map((test) => test.id),
      productionSources: hashes,
      evaluationSources: evaluationHashes,
      fixtureSha256: createHash('sha256').update(dataset).digest('hex'),
      metricConfigSha256: createHash('sha256').update(JSON.stringify(config)).digest('hex'),
      checkOnly: values.check || values['prepare-only'],
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Compaction eval: ${selected.length} cases; summarizer ${values.model}; judge ${values.judge}; ${samples} judge samples.`,
);
if (values['prepare-only']) {
  console.log(`Prepared ${stage}`);
  process.exit(0);
}
const compiler = process.env.HARNEST_COMPILER || 'harnest';
const env = {
  ...process.env,
  DEXTANA_EVAL_MODEL: values.model,
  DEXTANA_EVAL_MEMORY: values.memory ? '1' : '0',
  OLLAMA_MODEL: values.judge,
  OLLAMA_BASE_URL: values['base-url'],
  LITELLM_LOCAL_MODEL_COST_MAP: 'True',
  OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT: 'NO_CONTENT',
  ADK_CAPTURE_MESSAGE_CONTENT_IN_SPANS: 'false',
};
function run(args, executable = compiler) {
  const result = spawnSync(executable, args, { env, stdio: 'inherit', timeout: 1_200_000 });
  if (result.error) throw result.error;
  return result.status ?? 1;
}
const profile = 'eval';
const lock = `harnest-${profile}.lock`;
const frozen = await access(join(template, lock)).then(
  () => true,
  () => false,
);
const sync = run(['env', 'sync', stage, '--profile', profile, ...(frozen ? ['--frozen'] : [])]);
if (sync) process.exit(sync);
if (!frozen) await copyFile(join(stage, lock), join(template, lock));
const manifestPath = output.replace('.json', '.manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
manifest.evalLockSha256 = createHash('sha256')
  .update(await readFile(join(stage, lock)))
  .digest('hex');
manifest.frameworkLockSha256 = createHash('sha256')
  .update(await readFile(join(stage, 'harnest.lock')))
  .digest('hex');
manifest.productionRuntimeLockSha256 = createHash('sha256')
  .update(await readFile(join(root, 'agent/harnest-runtime.lock')))
  .digest('hex');
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
let status;
if (values.check) {
  // The Go `test` command selects the smaller development profile without
  // --evals. Run Harnest's Python test CLI in the eval profile for model-free
  // checks that import the full native metric registry.
  const environment = JSON.parse(
    await readFile(join(stage, '.harnest/environment-eval.json'), 'utf8'),
  );
  const environmentRoot = resolve(stage, '.harnest', environment.directory);
  if (!environmentRoot.startsWith(resolve(stage, '.harnest/environments') + sep))
    throw new Error('Invalid eval environment path');
  const python = join(
    environmentRoot,
    process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
  );
  status = run(['-m', 'harnest.cli', 'test', stage, '--mode', 'advanced'], python);
} else {
  status = run(['test', stage, '--evals', '--eval-output', output]);
}
console.log(
  values.check
    ? 'Metric checks finished; no quality evaluation was run.'
    : `Harnest evaluation report: ${output}`,
);
process.exit(status);
