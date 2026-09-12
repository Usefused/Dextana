import { constants } from 'node:fs';
import {
  access,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  realpath,
  rm,
  writeFile,
  type FileHandle,
} from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { basename, delimiter, dirname, extname, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WorkFiles } from '../files';
import type { DesktopProcessingJob } from '../../shared/desktop-workflows';

export async function desktopFile(path: unknown, directory = false): Promise<string> {
  if (
    typeof path !== 'string' ||
    !isAbsolute(path) ||
    path.length > 4096 ||
    /[\x00-\x1f]/.test(path)
  )
    throw new Error('Choose an absolute local path.');
  const canonical = await realpath(dirname(path));
  const target = join(canonical, basename(path));
  const info = await lstat(target);
  if (info.isSymbolicLink() || (directory ? !info.isDirectory() : !info.isFile()))
    throw new Error(`Choose a regular ${directory ? 'folder' : 'file'}, not a symbolic link.`);
  return target;
}
export async function desktopOutput(path: unknown): Promise<string> {
  if (
    typeof path !== 'string' ||
    !isAbsolute(path) ||
    path.length > 4096 ||
    /[\x00-\x1f]/.test(path)
  )
    throw new Error('Choose an absolute output file path.');
  const parent = await desktopFile(dirname(path), true);
  const target = join(parent, basename(path));
  try {
    await lstat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return target;
    throw error;
  }
  throw new Error(`The destination already exists: ${target}`);
}
export async function fileIdentity(path: string) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink())
    throw new Error('The file is no longer a regular file.');
  return `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}`;
}

async function copyInput(source: string, destination: string, signal: AbortSignal) {
  const identity = await fileIdentity(source);
  const sourceHandle = await open(
    source,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const info = await sourceHandle.stat();
    if (
      !info.isFile() ||
      `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}` !== identity ||
      (await fileIdentity(source)) !== identity
    )
      throw new Error('The input changed before local processing started.');
    if (info.size > 500_000_000) throw new Error('Local processing inputs are limited to 500 MB.');
    const destinationHandle = await open(destination, 'wx', 0o600);
    try {
      await copyInputBytes(sourceHandle, destinationHandle, signal);
      if ((await fileIdentity(source)) !== identity)
        throw new Error('The input changed while preparing local processing.');
    } finally {
      await destinationHandle.close();
    }
  } finally {
    await sourceHandle.close();
  }
}

async function writeChunk(handle: FileHandle, buffer: Buffer, length: number, position: number) {
  let written = 0;
  while (written < length) {
    const result = await handle.write(buffer, written, length - written, position + written);
    if (!result.bytesWritten) throw new Error('The private input copy could not be written.');
    written += result.bytesWritten;
  }
}
async function copyInputBytes(source: FileHandle, destination: FileHandle, signal: AbortSignal) {
  const buffer = Buffer.alloc(1024 * 1024);
  let position = 0;
  while (true) {
    signal.throwIfAborted();
    const { bytesRead } = await source.read(buffer, 0, buffer.length, position);
    if (!bytesRead) return;
    if (position + bytesRead > 500_000_000) throw new Error('The input grew beyond 500 MB.');
    await writeChunk(destination, buffer, bytesRead, position);
    position += bytesRead;
  }
}

export interface LocalProcessors {
  index: true;
  ocr?: string;
  transcribe?: string;
  convert?: string;
}
function processorSearchPaths() {
  const inherited = (process.env.PATH ?? '').split(delimiter).filter(isAbsolute);
  // Finder launches commonly omit Homebrew from PATH even when its tools are installed.
  const homebrew = process.platform === 'darwin' ? ['/opt/homebrew/bin', '/usr/local/bin'] : [];
  return [...new Set([...inherited, ...homebrew])];
}
async function findProcessor(names: string[], extra: string[] = []) {
  const candidates = [
    ...extra,
    ...processorSearchPaths().flatMap((folder) => names.map((name) => join(folder, name))),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
      const info = await lstat(candidate);
      if (info.isFile() || info.isSymbolicLink()) return await realpath(candidate);
    } catch {
      /* Optional processors are discovered; they are never downloaded automatically. */
    }
  }
}
function windowsInstallation(relativePath: string[]) {
  if (process.platform !== 'win32' || !process.env.ProgramFiles) return [];
  return [join(process.env.ProgramFiles, ...relativePath)];
}
function officeInstallations() {
  if (process.platform === 'darwin')
    return ['/Applications/LibreOffice.app/Contents/MacOS/soffice'];
  return windowsInstallation(['LibreOffice', 'program', 'soffice.exe']);
}
export async function discoverLocalProcessors(): Promise<LocalProcessors> {
  const windows = process.platform === 'win32';
  const [ocr, transcribe, convert] = await Promise.all([
    findProcessor(
      [windows ? 'tesseract.exe' : 'tesseract'],
      windowsInstallation(['Tesseract-OCR', 'tesseract.exe']),
    ),
    findProcessor([windows ? 'whisper-cli.exe' : 'whisper-cli']),
    findProcessor(windows ? ['soffice.exe'] : ['soffice', 'libreoffice'], officeInstallations()),
  ]);
  return { index: true, ocr, transcribe, convert };
}
async function run(executable: string, args: string[], signal: AbortSignal) {
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    let timer: ReturnType<typeof setTimeout> | undefined;
    const abort = () => {
      child.kill('SIGTERM');
      timer = setTimeout(() => child.kill('SIGKILL'), 1500);
      timer.unref();
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    child.stderr?.on('data', (data) => {
      stderr = (stderr + String(data)).slice(-4000);
    });
    child.once('error', finish);
    child.once('close', (code) =>
      finish(
        signal.aborted
          ? new Error('Local processing cancelled.')
          : code === 0
            ? undefined
            : new Error(`Local processor exited with code ${code}: ${stderr.trim()}`),
      ),
    );
    function finish(error?: Error) {
      signal.removeEventListener('abort', abort);
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    }
  });
}
type ProcessingKind = DesktopProcessingJob['kind'];
const processorInstallNames = {
  index: 'the built-in document reader',
  ocr: 'Tesseract',
  transcribe: 'whisper.cpp (whisper-cli) and a local model',
  convert: 'LibreOffice',
};
function processingKind(value: unknown, processors: LocalProcessors): ProcessingKind {
  if (typeof value !== 'string' || !Object.hasOwn(processorInstallNames, value))
    throw new Error('Choose index, ocr, transcribe or convert.');
  const kind = value as ProcessingKind;
  if (!processors[kind])
    throw new Error(
      `${kind} is unavailable. Install ${processorInstallNames[kind]} on this device, then discover desktop capabilities again.`,
    );
  return kind;
}
async function processingPaths(value: unknown, kind: ProcessingKind) {
  const limit = kind === 'index' ? 100 : 1;
  if (!Array.isArray(value) || !value.length || value.length > limit)
    throw new Error(kind === 'index' ? 'Index 1–100 files.' : 'Process one file at a time.');
  const paths = await Promise.all(value.map((path) => desktopFile(path)));
  const maxBytes = kind === 'index' ? 5_000_000 : 500_000_000;
  for (const path of paths)
    if ((await lstat(path)).size > maxBytes)
      throw new Error('The input exceeds the local processing size limit.');
  return paths;
}
function processingFormats(kind: ProcessingKind, inputPath: string, outputPath: string) {
  const input = extname(inputPath).toLowerCase();
  const output = extname(outputPath).toLowerCase();
  const outputs: Record<ProcessingKind, string[]> = {
    index: ['.json'],
    ocr: ['.txt'],
    transcribe: ['.txt'],
    convert: ['.pdf', '.docx', '.xlsx', '.txt'],
  };
  if (!outputs[kind].includes(output))
    throw new Error(`${kind} output must use ${outputs[kind].join(', ')}.`);
  const inputs: Partial<Record<ProcessingKind, string[]>> = {
    ocr: ['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.bmp', '.webp'],
    transcribe: ['.wav'],
    convert: ['.docx', '.odt', '.rtf', '.xlsx', '.ods', '.csv', '.pptx', '.odp', '.txt'],
  };
  const allowed = inputs[kind];
  if (allowed && !allowed.includes(input))
    throw new Error(`${kind} accepts ${allowed.join(', ')} input files.`);
  if (kind === 'convert' && input === output)
    throw new Error('Choose an output format different from the source format.');
}
export async function validateProcessing(
  args: Record<string, unknown>,
  processors: LocalProcessors,
) {
  const kind = processingKind(args.kind, processors);
  const paths = await processingPaths(args.paths, kind);
  const outputPath = await desktopOutput(args.outputPath);
  processingFormats(kind, paths[0], outputPath);
  const modelPath = kind === 'transcribe' ? await desktopFile(args.modelPath) : undefined;
  return { kind, paths, outputPath, ...(modelPath ? { modelPath } : {}) };
}
type ProcessingPlan = Awaited<ReturnType<typeof validateProcessing>>;
async function indexDocuments(
  paths: string[],
  scratch: string,
  output: string,
  signal: AbortSignal,
) {
  const files = new WorkFiles(scratch);
  const documents: { path: string; content: unknown }[] = [];
  for (const path of paths) {
    signal.throwIfAborted();
    const plan = await files.prepare({ action: 'read', path });
    if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(plan.format))
      throw new Error('Run OCR on images before indexing.');
    documents.push({ path, content: await files.execute(plan, signal) });
  }
  await writeFile(
    output,
    JSON.stringify({ version: 1, indexedAt: new Date().toISOString(), documents }, null, 2),
    { flag: 'wx', mode: 0o600 },
  );
}
async function convertDocument(
  executable: string,
  copied: string,
  scratch: string,
  output: string,
  signal: AbortSignal,
) {
  const extension = extname(output).slice(1);
  // An isolated profile keeps conversion separate from any office document the owner has open.
  await run(
    executable,
    [
      `-env:UserInstallation=${pathToFileURL(join(scratch, 'profile')).href}`,
      '--headless',
      '--convert-to',
      extension,
      '--outdir',
      scratch,
      copied,
    ],
    signal,
  );
  await copyFile(join(scratch, `input.${extension}`), output, constants.COPYFILE_EXCL);
}
async function stageNativeOutput(
  plan: ProcessingPlan,
  processors: LocalProcessors,
  scratch: string,
  output: string,
  signal: AbortSignal,
) {
  // Native tools receive a bounded private input copy, never the user's output folder.
  const copied = join(scratch, `input${extname(plan.paths[0]).toLowerCase()}`);
  await copyInput(plan.paths[0], copied, signal);
  if (plan.kind === 'ocr') return run(processors.ocr!, [copied, join(scratch, 'result')], signal);
  if (plan.kind === 'transcribe')
    return run(
      processors.transcribe!,
      ['-m', plan.modelPath!, '-f', copied, '-otxt', '-of', join(scratch, 'result')],
      signal,
    );
  if (plan.kind === 'convert')
    return convertDocument(processors.convert!, copied, scratch, output, signal);
  throw new Error('Choose a supported native processor.');
}
async function publishOutput(staged: string, outputPath: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const info = await lstat(staged);
  if (!info.isFile() || info.isSymbolicLink())
    throw new Error('The local processor did not produce a regular output file.');
  if (info.size > 100_000_000) throw new Error('Local output exceeds 100 MB.');
  // Revalidate after processing. Exclusive publication never overwrites a competing destination.
  if ((await desktopOutput(outputPath)) !== outputPath)
    throw new Error('The output folder changed during processing.');
  await copyFile(staged, outputPath, constants.COPYFILE_EXCL);
  return { path: outputPath };
}
export async function processLocally(
  job: DesktopProcessingJob,
  processors: LocalProcessors,
  workDirectory: string,
  signal: AbortSignal,
) {
  const plan = await validateProcessing(job as unknown as Record<string, unknown>, processors);
  await mkdir(workDirectory, { recursive: true, mode: 0o700 });
  const scratch = await mkdtemp(join(workDirectory, 'job-'));
  try {
    const staged = join(scratch, `result${extname(plan.outputPath).toLowerCase()}`);
    if (plan.kind === 'index') await indexDocuments(plan.paths, scratch, staged, signal);
    else await stageNativeOutput(plan, processors, scratch, staged, signal);
    return await publishOutput(staged, plan.outputPath, signal);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
