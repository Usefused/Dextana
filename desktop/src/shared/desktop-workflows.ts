export type DesktopWorkflowWork = 'workflows' | 'processing' | 'device';
export interface DesktopWorkflowDescriptor {
  name: string;
  work: DesktopWorkflowWork;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
  mutates: boolean;
}
export interface DesktopWatchRule {
  id: string;
  activityId: string;
  name: string;
  folder: string;
  prompt: string;
  extensions: string[];
  enabled: boolean;
  seen: Record<string, string>;
  pending: string[];
  status: 'watching' | 'paused' | 'running' | 'error';
  lastRunAt?: string;
  error?: string;
}
export interface DesktopRenameEntry {
  from: string;
  to: string;
  identity: string;
  moved: boolean;
}
export interface DesktopRenamePreview {
  id: string;
  activityId: string;
  createdAt: string;
  status: 'preview' | 'applying' | 'applied' | 'partial' | 'undone';
  direction?: 'apply' | 'undo';
  entries: DesktopRenameEntry[];
  error?: string;
}
export interface DesktopProcessingJob {
  id: string;
  activityId: string;
  kind: 'index' | 'ocr' | 'transcribe' | 'convert';
  paths: string[];
  outputPath: string;
  modelPath?: string;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
  finishedAt?: string;
  error?: string;
}
export interface DesktopWorkflowSnapshot {
  watches: DesktopWatchRule[];
  renames: DesktopRenamePreview[];
  jobs: DesktopProcessingJob[];
  onBattery: boolean;
  pauseOnBattery: boolean;
}
const property = (type: string, description?: string) => ({
  type,
  ...(description ? { description } : {}),
});
const descriptor = (
  name: string,
  work: DesktopWorkflowWork,
  description: string,
  properties: Record<string, unknown>,
  required: string[] = [],
  mutates = true,
): DesktopWorkflowDescriptor => ({
  name,
  work,
  description,
  inputSchema: { type: 'object', properties, required, additionalProperties: false },
  mutates,
});
const id = property('string');
export const desktopWorkflowDescriptors: DesktopWorkflowDescriptor[] = [
  descriptor(
    'workflow.watch_save',
    'workflows',
    'Watch a single folder for stable new or changed matching files while Dextana runs. Existing files form the baseline. Changes while closed are found on restart; future work retains normal action permissions. Updating a rule resets its baseline.',
    {
      id,
      name: id,
      folder: id,
      prompt: id,
      extensions: { type: 'array', items: property('string') },
      enabled: property('boolean'),
    },
    ['name', 'folder', 'prompt'],
  ),
  descriptor(
    'workflow.watch_list',
    'workflows',
    'List this chat’s watched folders and their errors or pending files.',
    {},
    [],
    false,
  ),
  descriptor(
    'workflow.watch_set_enabled',
    'workflows',
    'Pause or resume a watched folder without losing pending changes or resetting its baseline. An already running workflow finishes normally.',
    { id, enabled: property('boolean') },
    ['id', 'enabled'],
  ),
  descriptor(
    'workflow.watch_remove',
    'workflows',
    'Remove this chat’s watched-folder rule and cancel its current dispatch.',
    { id },
    ['id'],
  ),
  descriptor(
    'workflow.watch_run',
    'workflows',
    'Retry pending work for a watched folder after resolving its error.',
    { id },
    ['id'],
  ),
  descriptor(
    'workflow.setup_open',
    'workflows',
    'Open up to 12 local files/folders and HTTP(S) pages using default applications. Returns an individual result for every item.',
    {
      targets: {
        type: 'array',
        items: { type: 'object', properties: { path: id, url: id }, additionalProperties: false },
      },
    },
    ['targets'],
  ),
  descriptor(
    'workflow.rename_preview',
    'workflows',
    'Prepare a durable, reviewable same-folder file rename preview. Does not rename files. Destinations must not exist; no overwrites or swaps.',
    {
      entries: {
        type: 'array',
        items: {
          type: 'object',
          properties: { from: id, name: id },
          required: ['from', 'name'],
          additionalProperties: false,
        },
      },
    },
    ['entries'],
  ),
  descriptor(
    'workflow.rename_apply',
    'workflows',
    'Apply a reviewed preview after checking all sources and destinations again. A conflict stops remaining renames; completed entries can be undone.',
    { id },
    ['id'],
  ),
  descriptor(
    'workflow.rename_undo',
    'workflows',
    'Undo a rename batch only if renamed files are unchanged and original names are available. Never overwrites files.',
    { id },
    ['id'],
  ),
  descriptor(
    'workflow.rename_list',
    'workflows',
    'List this chat’s rename previews and undo history.',
    {},
    [],
    false,
  ),
  descriptor(
    'workflow.handoff',
    'workflows',
    'Open a local document in its default application.',
    { path: id },
    ['path'],
  ),
  descriptor(
    'workflow.notify',
    'workflows',
    'Show a desktop completion notification linked to this chat and optionally a local result file. Returns unavailable if this desktop cannot notify.',
    { title: id, body: id, path: id },
    ['title', 'body'],
  ),
  descriptor(
    'processing.capabilities',
    'processing',
    'Refresh which offline processors are installed on this device. Discover processing again after installing a processor.',
    {},
    [],
    false,
  ),
  descriptor(
    'processing.start',
    'processing',
    'Queue offline local indexing, OCR (installed tesseract), transcription (installed whisper-cli and a local model), or document conversion (installed LibreOffice). Output is a new file; jobs pause and restart on battery by default. Poll processing.list for completion.',
    {
      kind: { type: 'string', enum: ['index', 'ocr', 'transcribe', 'convert'] },
      paths: { type: 'array', items: id },
      outputPath: id,
      modelPath: id,
    },
    ['kind', 'paths', 'outputPath'],
  ),
  descriptor(
    'processing.list',
    'processing',
    'List local processing jobs belonging to this chat.',
    {},
    [],
    false,
  ),
  descriptor(
    'processing.cancel',
    'processing',
    'Cancel this chat’s queued, paused or running local processing job.',
    { id },
    ['id'],
  ),
  descriptor(
    'device.power_policy',
    'device',
    'Set whether expensive local processing and watched-folder dispatch pause while the device is on battery. Active processing restarts safely on external power.',
    { pauseOnBattery: property('boolean') },
    ['pauseOnBattery'],
  ),
  descriptor(
    'device.status',
    'device',
    'Read power state, background policy, and detected offline processors.',
    {},
    [],
    false,
  ),
];
