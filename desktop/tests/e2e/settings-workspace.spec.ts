import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { test, start, reply } from './fixture';

function findSkills(value: any): any[] | undefined {
  if (typeof value === 'string') { try { return findSkills(JSON.parse(value)); } catch { return; } }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value.skills)) return value.skills;
  for (const child of Object.values(value)) { const result = findSkills(child); if (result) return result; }
}

test('settings adds a dynamic skill, tracks reported tokens, and retains both after restart', async ({ workspace }, info) => {
  test.setTimeout(120_000);
  let loaded = false;
  const work = await workspace((body, res) => {
    const results = body.messages.filter((message: any) => message.role === 'tool');
    if (!results.length) reply(body, res, '', [{ function: { name: 'list_skills', arguments: { source: 'personal', query: 'weekly-review', limit: 50 } } }]);
    else if (results.length === 1) {
      const skill = findSkills(results[0].content)?.find(item => item.name === 'weekly-review');
      if (skill) {
        expect(skill.id).toBe('personal/weekly-review');
        expect(JSON.stringify(skill)).not.toMatch(/\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/i);
      }
      if (skill) reply(body, res, '', [{ function: { name: 'load_skill', arguments: { name: skill.id, source: skill.source, version: skill.version } } }]);
      else reply(body, res, 'Personal skill unavailable.');
    } else {
      loaded = JSON.stringify(results.at(-1).content).includes('Start with three concrete achievements.');
      reply(body, res, loaded ? 'Personal skill loaded successfully.' : 'Personal skill unavailable.');
    }
    return true;
  });
  let skillId: string | undefined;
  let importedId: string | undefined;
  try {
    await work.page.getByRole('button', { name: 'Settings', exact: true }).click();
    const sections = () => work.page.getByRole('navigation', { name: 'Settings sections' });
    await work.page.getByLabel('Search settings').fill('skills');
    await expect(sections().getByRole('button', { name: 'Models', exact: true })).toHaveCount(0);
    await sections().getByRole('button', { name: 'Skills', exact: true }).click();
    await work.page.getByLabel('Search settings').fill('');
    await work.page.getByRole('button', { name: 'Add skill', exact: true }).click();
    const editor = work.page.getByRole('dialog', { name: 'Add skill' });
    await editor.getByLabel('Name', { exact: true }).fill('weekly-review');
    await editor.getByLabel('Description', { exact: true }).fill('Prepare a weekly review of completed work.');
    await editor.getByLabel('Instructions', { exact: true }).fill('Start with three concrete achievements.');
    await editor.getByRole('button', { name: 'Save skill' }).click();
    await expect(editor).toHaveCount(0);
    await expect(work.page.getByText('weekly-review', { exact: true })).toBeVisible();
    skillId = (await work.page.evaluate(() => window.dextana.skills())).find(skill => skill.name === 'weekly-review')!.id;
    const before = await work.page.evaluate(() => window.dextana.usage('all'));
    await work.page.getByRole('button', { name: 'Back to chats' }).click();
    await start(work.page, 'Use my weekly-review skill.');
    await expect(work.page.getByTestId('assistant-message').last()).toContainText('Personal skill loaded successfully.', { timeout: 60_000 });
    expect(loaded).toBe(true);
    const after = await work.page.evaluate(() => window.dextana.usage('all'));
    expect(after.inputTokens - before.inputTokens).toBe(30);
    expect(after.outputTokens - before.outputTokens).toBe(15);
    expect(after.calls - before.calls).toBe(3);
    await work.page.getByRole('button', { name: 'Settings', exact: true }).click();
    await sections().getByRole('button', { name: 'Usage', exact: true }).click();
    await expect(work.page.getByRole('heading', { name: 'Token usage' })).toBeVisible();
    await expect(work.page.getByRole('table', { name: 'Usage by model' })).toContainText('qwen3:8b');
    await work.page.screenshot({ path: info.outputPath('settings-usage.png') });
    await sections().getByRole('button', { name: 'Connectors', exact: true }).click();
    await expect(work.page.getByRole('heading', { name: 'Connectors', exact: true, level: 1 })).toBeVisible();
    await work.restart();
    expect((await work.page.evaluate(() => window.dextana.usage('all'))).totalTokens).toBe(after.totalTokens);
    await work.page.getByRole('button', { name: 'Settings', exact: true }).click();
    await sections().getByRole('button', { name: 'Skills', exact: true }).click();
    await work.page.getByRole('switch', { name: 'Enable weekly-review' }).click();
    await expect(work.page.getByRole('switch', { name: 'Enable weekly-review' })).not.toBeChecked();
    await work.page.getByRole('button', { name: 'Edit weekly-review' }).click();
    const edit = work.page.getByRole('dialog', { name: 'Edit skill' });
    await edit.getByLabel('Description', { exact: true }).fill('A concise review of the week.');
    await edit.getByRole('button', { name: 'Save skill' }).click();
    await expect(work.page.getByText('A concise review of the week.', { exact: true })).toBeVisible();
    await work.page.screenshot({ path: info.outputPath('settings-skills.png') });
    await work.page.getByRole('button', { name: 'Delete weekly-review' }).click();
    await work.page.getByRole('button', { name: 'Delete skill', exact: true }).click();
    await expect(work.page.getByText('weekly-review', { exact: true })).toHaveCount(0);
    skillId = undefined;
    const file = join(work.directory, 'SKILL.md');
    await writeFile(file, '---\nname: imported-note\ndescription: Write concise notes.\n---\nUse short paragraphs.');
    await work.app().evaluate(({ dialog }, file) => {
      (globalThis as any).skillDialogOriginal = dialog.showOpenDialog;
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, file);
    try { await work.page.getByRole('button', { name: 'Import SKILL.md' }).click(); }
    finally { await work.app().evaluate(({ dialog }) => { dialog.showOpenDialog = (globalThis as any).skillDialogOriginal; delete (globalThis as any).skillDialogOriginal; }); }
    const imported = work.page.getByRole('dialog', { name: 'Add skill' });
    await expect(imported.getByLabel('Instructions', { exact: true })).toHaveValue('Use short paragraphs.');
    await imported.getByRole('button', { name: 'Save skill' }).click();
    await expect(work.page.getByText('imported-note', { exact: true })).toBeVisible();
    importedId = (await work.page.evaluate(() => window.dextana.skills())).find(skill => skill.name === 'imported-note')!.id;
    await sections().getByRole('button', { name: 'Appearance', exact: true }).click();
    await work.page.getByLabel('Color theme').selectOption('dark');
    await expect(work.page.getByText('Appearance saved')).toBeVisible();
    await work.page.screenshot({ path: info.outputPath('settings-appearance-dark.png') });
    await sections().getByRole('button', { name: 'Skills', exact: true }).click();
    await work.app().evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(960, 760));
    await work.page.screenshot({ path: info.outputPath('settings-skills-dark-compact.png') });
    expect(await work.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    await work.page.evaluate(() => window.dextana.setTheme('system'));
    if (importedId) await work.page.evaluate(id => window.dextana.deleteSkill(id), importedId);
    if (skillId) await work.page.evaluate(id => window.dextana.deleteSkill(id), skillId);
    await work.close();
  }
});
