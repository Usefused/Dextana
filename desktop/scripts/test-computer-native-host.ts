import { app, BrowserWindow } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { DesktopComputer } from '../src/main/desktop/computer';
import { CuaAdapter } from '../src/main/desktop/cua-adapter';
import { DextComputerCursor } from '../src/main/desktop/cursor';

const directory = process.argv[2];
let fixture: ChildProcess | undefined;
const service = new DesktopComputer(new CuaAdapter(), () => {}, new DextComputerCursor());
const signal = AbortSignal.timeout(90_000);
async function observe() {
  return (await service.execute(
    'trial',
    { application: 'Dext Computer Trial', windowTitle: 'Dext computer trial' },
    signal,
  )) as Record<string, unknown>;
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
async function verifyColdLaunch() {
  const launched = await service.launch('trial', { application: 'Calculator' }, signal);
  assert.equal(launched.launched, true);
  assert.equal(launched.application, 'Calculator');
  assert.equal(typeof launched.window, 'string');
  const state = await observeCalculator();
  assert.equal(typeof state.snapshotId, 'string');
  assert.ok(
    Array.isArray(state.elements) && state.elements.length > 5,
    'Expected accessible Calculator controls after launch',
  );
  await clickCalculator(['All Clear', 'Clear']);
  await clickCalculator(['All Clear', 'Clear']);
  for (const label of ['5', 'Multiply', '1', '0', 'Equals']) await clickCalculator([label]);
  await writeFile(join(directory, 'calculator.json'), JSON.stringify(state, null, 2));
  console.log('PASS Calculator: launched, focused, inspected, and clicked 5 × 10 =');
  return 0;
}
async function observeCalculator() {
  return (await service.execute('trial', { application: 'Calculator' }, signal)) as Record<
    string,
    unknown
  >;
}
async function clickCalculator(labels: string[]) {
  const state = await observeCalculator();
  const rows = state.elements as Record<string, unknown>[];
  const target = rows.find((row) => labels.includes(String(row.label)));
  assert.ok(target, `Expected Calculator element: ${labels.join(' or ')}`);
  await service.execute(
    'trial',
    {
      snapshotId: state.snapshotId,
      elementIndex: target.element_index,
      action: 'click',
    },
    signal,
  );
}
async function interactiveTrial() {
  fixture = spawn(join(directory, 'DextComputerTrial.app/Contents/MacOS/trial'), [directory], {
    stdio: 'ignore',
  });
  let initial: Record<string, unknown> | undefined;
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      initial = await observe();
      if (JSON.stringify(initial).includes('Brief text')) break;
    } catch (error) {
      if (!String(error).includes('No visible Dext Computer Trial window')) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(initial && JSON.stringify(initial).includes('Brief text'));
  await writeFile(join(directory, 'initial.json'), JSON.stringify(initial, null, 2));
  await act('Brief text', 'type', 'Dext native trial brief');
  for (
    let attempt = 0;
    attempt < 10 &&
    !BrowserWindow.getAllWindows().some(
      (window) => window.getTitle() === 'Dext computer-use cursor' && window.isVisible(),
    );
    attempt++
  )
    await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(
    BrowserWindow.getAllWindows().some(
      (window) => window.getTitle() === 'Dext computer-use cursor' && window.isVisible(),
    ),
    'Expected the Dext computer-use cursor to be visible',
  );
  await verify('Dext native trial brief');
  await act('Save brief');
  assert.equal(await readFile(join(directory, 'brief.txt'), 'utf8'), 'Dext native trial brief');
  console.log('PASS document editing: saved text independently read from disk');
  if (process.argv[3] === 'document-only') return 0;
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
async function trial() {
  const status = await service.enable();
  if (!status.enabled) {
    console.log(
      'BLOCKED: grant Electron Accessibility and Screen Recording, then rerun. No native input attempted.',
      status.permissions,
    );
    return 2;
  }
  return process.argv[3] === 'launch-only' ? verifyColdLaunch() : interactiveTrial();
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
