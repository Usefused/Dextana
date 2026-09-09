import { randomUUID } from 'node:crypto';
import { link, unlink } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import type {
  DesktopWatchRule,
  DesktopRenameEntry,
  DesktopRenamePreview,
  DesktopProcessingJob,
} from '../../shared/desktop-workflows';
import { desktopFile, desktopOutput, fileIdentity } from './workflows-processors';

export interface WorkflowState {
  version: 1;
  watches: DesktopWatchRule[];
  renames: DesktopRenamePreview[];
  jobs: DesktopProcessingJob[];
  pauseOnBattery: boolean;
}
export function workflowText(value: unknown, label: string, max = 500) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || value.includes('\0'))
    throw new Error(`Provide ${label} (up to ${max} characters).`);
  return value.trim();
}
export function parseWorkflowState(serialized: string): WorkflowState {
  const saved = JSON.parse(serialized);
  if (
    !saved ||
    saved.version !== 1 ||
    !Array.isArray(saved.watches) ||
    !Array.isArray(saved.renames) ||
    !Array.isArray(saved.jobs) ||
    typeof saved.pauseOnBattery !== 'boolean'
  )
    throw new Error('The saved desktop workflow state is invalid.');
  return saved;
}
async function existingIdentity(path: string) {
  try {
    return await fileIdentity(path);
  } catch (error) {
    // An unreadable entry is not a missing entry: recovery must never infer a completed rename from access errors.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}
async function recoverRenameEntry(entry: DesktopRenameEntry, undo: boolean) {
  try {
    const [source, target] = await Promise.all([
      existingIdentity(entry.from),
      existingIdentity(entry.to),
    ]);
    if (source === entry.identity && target === entry.identity) {
      // A crash between link and unlink leaves a duplicate, not an extra user document.
      await unlink(undo ? entry.from : entry.to);
      entry.moved = undo;
    } else if (!source && target === entry.identity) entry.moved = true;
    else if (source === entry.identity && !target) entry.moved = false;
  } catch {
    /* Leave inaccessible or changed files untouched for explicit review. */
  }
}
async function recoverRename(batch: DesktopRenamePreview) {
  if (batch.status !== 'applying') return;
  batch.status = 'partial';
  batch.error =
    'Dextana closed during this rename. Review the recorded files before retrying or undoing.';
  for (const entry of batch.entries) await recoverRenameEntry(entry, batch.direction === 'undo');
}
export async function recoverWorkflowState(state: WorkflowState) {
  // Never replay interrupted agent work: it may already have performed external actions.
  for (const rule of state.watches)
    if (rule.status === 'running') {
      rule.status = 'error';
      rule.error =
        'Dextana closed during this folder workflow. Review the chat before retrying pending files.';
    }
  for (const batch of state.renames) await recoverRename(batch);
  for (const job of state.jobs)
    if (job.status === 'running') {
      job.status = 'failed';
      job.error =
        'Dextana closed during processing. Check whether the output exists before starting another job.';
    }
}
function watchExtensions(value: unknown): string[] {
  if (value === undefined) return [];
  if (
    !Array.isArray(value) ||
    value.length > 30 ||
    value.some((item) => typeof item !== 'string' || !/^\.?[a-zA-Z0-9]{1,12}$/.test(item))
  )
    throw new Error('Use up to 30 filename extensions such as pdf or xlsx.');
  return value.map((item) => item.replace(/^\./, '').toLowerCase());
}
export async function createWatchRule(
  args: Record<string, unknown>,
  activityId: string,
  previousId?: string,
): Promise<DesktopWatchRule> {
  if (args.enabled !== undefined && typeof args.enabled !== 'boolean')
    throw new Error('enabled must be a boolean.');
  return {
    id: previousId ?? randomUUID(),
    activityId,
    name: workflowText(args.name, 'a folder workflow name', 120),
    folder: await desktopFile(args.folder, true),
    prompt: workflowText(args.prompt, 'folder workflow instructions', 8000),
    extensions: watchExtensions(args.extensions),
    enabled: args.enabled !== false,
    seen: {},
    pending: [],
    status: args.enabled === false ? 'paused' : 'watching',
  };
}
export function matchesWatch(entry: Dirent, extensions: string[]) {
  if (
    !entry.isFile() ||
    entry.isSymbolicLink() ||
    entry.name.startsWith('.') ||
    entry.name.startsWith('~$') ||
    /\.(tmp|part|crdownload)$/i.test(entry.name)
  )
    return false;
  return !extensions.length || extensions.includes(extname(entry.name).slice(1).toLowerCase());
}
function portableFilename(value: unknown) {
  const name = workflowText(value, 'a new filename', 240);
  if (
    basename(name) !== name ||
    /[\\/:*?"<>|\x00-\x1f]/.test(name) ||
    name === '.' ||
    name === '..' ||
    /[. ]$/.test(name) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
  )
    throw new Error('Use a portable filename without directory separators.');
  return name;
}
export async function createRenameEntry(value: unknown): Promise<DesktopRenameEntry> {
  if (!value || typeof value !== 'object')
    throw new Error('Provide from and name for every rename.');
  const args = value as Record<string, unknown>;
  const from = await desktopFile(args.from);
  const to = await desktopOutput(join(dirname(from), portableFilename(args.name)));
  return { from, to, identity: await fileIdentity(from), moved: false };
}
export function renameTargets(entry: DesktopRenameEntry, undo: boolean) {
  return { source: undo ? entry.to : entry.from, destination: undo ? entry.from : entry.to };
}
export async function validateRenameEntry(entry: DesktopRenameEntry, undo: boolean) {
  const { source, destination } = renameTargets(entry, undo);
  if ((await desktopFile(source)) !== source || (await fileIdentity(source)) !== entry.identity)
    throw new Error(`The source changed since preview: ${source}`);
  if ((await desktopOutput(destination)) !== destination)
    throw new Error('The destination folder changed. Create another preview.');
}
export function pendingRenameEntries(batch: DesktopRenamePreview, undo: boolean) {
  const valid = undo ? ['applied', 'partial'].includes(batch.status) : batch.status === 'preview';
  if (!valid)
    throw new Error(
      undo
        ? 'This rename has no completed entries to undo.'
        : 'This preview was already applied. Create a fresh preview.',
    );
  return batch.entries.filter((entry) => (undo ? entry.moved : !entry.moved));
}
export async function renameEntryExclusive(entry: DesktopRenameEntry, undo: boolean) {
  const { source, destination } = renameTargets(entry, undo);
  await validateRenameEntry(entry, undo);
  // A same-folder hard link fails if the target exists, unlike rename(), which can overwrite it.
  await link(source, destination);
  try {
    if (
      (await fileIdentity(source)) !== entry.identity ||
      (await fileIdentity(destination)) !== entry.identity
    )
      throw new Error('The file changed during this rename.');
    await unlink(source);
  } catch (error) {
    if ((await existingIdentity(destination).catch(() => undefined)) === entry.identity)
      await unlink(destination).catch(() => {});
    throw error;
  }
  entry.moved = !undo;
}
