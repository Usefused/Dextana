import { spawnSync } from 'node:child_process';

const compiler = process.env.HARNEST_COMPILER || 'harnest';
for (const args of [
  ['env', 'sync', 'agent', '--profile', 'development', '--frozen'],
  ['test', 'agent'],
]) {
  const result = spawnSync(compiler, args, {
    stdio: 'inherit',
    env: { ...process.env, LITELLM_LOCAL_MODEL_COST_MAP: 'True' },
    timeout: 900_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
