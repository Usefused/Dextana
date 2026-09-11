import { constants } from 'node:fs';
import { open, lstat, realpath, rename, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';

export const textRevision = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const editing = new Set<string>();
const identity = (info: { dev: number; ino: number }) => `${info.dev}:${info.ino}`;
export interface FileSnapshot {
  data: Buffer;
  revision: string;
  identity: string;
  mode: number;
  mtimeMs: number;
  ctimeMs: number;
}

export async function snapshotFile(path: string, signal?: AbortSignal): Promise<FileSnapshot> {
  signal?.throwIfAborted();
  const entry = await lstat(path);
  if (!entry.isFile() || entry.nlink !== 1) throw new Error('Edit a regular file, not a symbolic or hard link.');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    if (identity(info) !== identity(entry) || !info.isFile() || info.size > 5_000_000)
      throw new Error('The document changed or exceeds 5 MB. Read it again.');
    const buffer = Buffer.alloc(5_000_001);
    let size = 0;
    while (size < buffer.length) {
      signal?.throwIfAborted();
      const { bytesRead } = await handle.read(buffer, size, buffer.length - size, size);
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size > 5_000_000) throw new Error('Document exceeds 5 MB.');
    const after = await handle.stat();
    const current = await lstat(path);
    if (!current.isFile() || current.nlink !== 1 || identity(current) !== identity(info) ||
        after.mtimeMs !== info.mtimeMs || after.ctimeMs !== info.ctimeMs || current.ctimeMs !== after.ctimeMs)
      throw new Error('The document changed. Read it again.');
    const data = buffer.subarray(0, size);
    return { data, revision: textRevision(data), identity: identity(info), mode: info.mode, mtimeMs: info.mtimeMs, ctimeMs: info.ctimeMs };
  } finally { await handle.close(); }
}

export interface TextSnapshot extends FileSnapshot { content: string }
export async function snapshotText(path: string, signal?: AbortSignal): Promise<TextSnapshot> {
  const snapshot = await snapshotFile(path, signal);
  const content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(snapshot.data);
  if (content.includes('\0') || content.length > 500_000)
    throw new Error('Edit UTF-8 text files up to 500,000 characters. Binary formats need a supported editor.');
  return { ...snapshot, content };
}

export async function replaceText(path: string, before: FileSnapshot, content: string, parentIdentity: string, signal: AbortSignal) {
  return replaceBytes(path, before, Buffer.from(content, 'utf8'), parentIdentity, signal);
}

export async function replaceBytes(path: string, before: FileSnapshot, content: Buffer, parentIdentity: string, signal: AbortSignal) {
  if (editing.has(before.identity)) throw new Error('Another edit is saving this file. Read it again before retrying.');
  editing.add(before.identity);
  try {
    return await saveReplacement(path, before, content, parentIdentity, signal);
  } finally { editing.delete(before.identity); }
}

async function saveReplacement(path: string, before: FileSnapshot, content: Buffer, parentIdentity: string, signal: AbortSignal) {
  const parent = dirname(path);
  async function unchanged() {
    signal.throwIfAborted();
    if (await realpath(parent) !== parent || identity(await lstat(parent)) !== parentIdentity)
      throw new Error('The destination folder changed. Request permission again.');
    const current = await snapshotFile(path, signal);
    if (current.identity !== before.identity || current.revision !== before.revision ||
        current.mode !== before.mode || current.mtimeMs !== before.mtimeMs || current.ctimeMs !== before.ctimeMs)
      throw new Error('The file changed while awaiting approval. Read it again and request a new edit.');
  }
  await unchanged();
  const temporary = join(parent, `.dextana-edit-${randomUUID()}.tmp`);
  const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    await handle.writeFile(content);
    await handle.chmod(before.mode & 0o777);
    await handle.sync();
    await handle.close();
    // Preserve the original until the fully written replacement is ready.
    await unchanged();
    signal.throwIfAborted();
    await rename(temporary, path);
  } finally {
    await handle.close().catch(() => {});
    await unlink(temporary).catch(() => {});
  }
  return { path, edited: true, bytes: Buffer.byteLength(content), revision: textRevision(Buffer.from(content)) };
}
