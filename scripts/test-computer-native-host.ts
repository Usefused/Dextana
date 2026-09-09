import { app } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { DesktopComputer } from '../src/main/desktop/computer';
import { CuaAdapter } from '../src/main/desktop/cua-adapter';

const directory = process.argv[2];
let fixture: ChildProcess | undefined;
const service = new DesktopComputer(new CuaAdapter(), () => {});
const signal = AbortSignal.timeout(90_000);
let selectionId = '';
async function observe() {
  return (await service.execute('trial', { selectionId }, signal)) as Record<string, unknown>;
}
function element(state: Record<string, unknown>, label: string) {
  const rows = state.elements as Record<string, unknown>[];
  const match = rows.find((row) => row.label === label || row.value === label);
  assert.ok(match, `Expected fixture element: ${label}`);
  return match;
}
async function act(label: string, action = 'click', text?: string) {
  const state = await observe();
  return service.execute(
    'trial',
    {
      selectionId,
      snapshotId: state.snapshotId,
      elementIndex: element(state, label).element_index,
      action,
      ...(text === undefined ? {} : { text }),
    },
    signal,
  );
}
async function verify(label: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const state = await observe();
    if (JSON.stringify(state.elements).includes(label)) return;
    await writeFile(join(directory, 'latest.json'), JSON.stringify(state, null, 2));
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Expected fixture state: ${label}`);
}
async function trial() {
  const status = await service.enable();
  if (!status.enabled) {
    console.log(
      'BLOCKED: grant Electron Accessibility and Screen Recording, then rerun. No native input attempted.',
      status.permissions,
    );
    return 2;
  }
  fixture = spawn(join(directory, 'DextComputerTrial.app/Contents/MacOS/trial'), [directory], {
    stdio: 'ignore',
  });
  let windows = await service.windows();
  for (
    let attempt = 0;
    attempt < 20 && !windows.some((window) => window.title === 'Dext computer trial');
    attempt++
  ) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    windows = await service.windows();
  }
  const window = windows.find((window) => window.title === 'Dext computer trial');
  assert.ok(window);
  const selected = await service.select(window.id, 'trial');
  selectionId = selected.selection!.id;
  const initial = await observe();
  await writeFile(join(directory, 'initial.json'), JSON.stringify(initial, null, 2));
  await act('Brief text', 'type', 'Dext native trial brief');
  await verify('Dext native trial brief');
  await act('Save brief');
  assert.equal(await readFile(join(directory, 'brief.txt'), 'utf8'), 'Dext native trial brief');
  console.log('PASS document editing: saved text independently read from disk');
  await act('Show summary');
  await verify('Summary: document ready for review');
  console.log('PASS native navigation: summary read back from accessibility state');
  await act('Open reference').catch((error) =>
    console.log('File-dialog input outcome uncertain; checking the window:', error.message),
  );
  const dialog = await observe();
  await writeFile(join(directory, 'dialog.json'), JSON.stringify(dialog, null, 2));
  await act('reference.txt');
  await act('Open');
  await verify('Opened reference.txt');
  assert.equal(await readFile(join(directory, 'opened.txt'), 'utf8'), 'reference.txt');
  console.log('PASS file dialog: selection independently recorded by native fixture');
  return 0;
}
app
  .whenReady()
  .then(trial)
  .then(async (code) => {
    await service.dispose();
    fixture?.kill();
    app.exit(code);
  })
  .catch(async (error) => {
    console.error(error);
    await service.dispose();
    fixture?.kill();
    app.exit(1);
  });
