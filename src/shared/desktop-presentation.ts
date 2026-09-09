const actions: Record<string, string> = {
  'computer.observe': 'Inspect selected window',
  'computer.act': 'Use selected window',
  'computer.stop': 'Stop computer use',
  'alarms.list': 'View timers and reminders',
  'timer.start': 'Start a timer',
  'timer.pause': 'Pause timer',
  'timer.resume': 'Resume timer',
  'timer.cancel': 'Cancel timer or reminder',
  'reminder.create': 'Create a reminder',
  'reminder.snooze': 'Snooze timer or reminder',
  'reminder.dismiss': 'Dismiss timer or reminder',
  'file.open': 'Open document',
  'workflow.watch_save': 'Watch a folder',
  'workflow.watch_set_enabled': 'Pause or resume folder watching',
  'workflow.watch_remove': 'Stop watching a folder',
  'workflow.watch_run': 'Retry pending folder work',
  'workflow.setup_open': 'Open your work setup',
  'workflow.rename_preview': 'Preview file names',
  'workflow.rename_apply': 'Rename files',
  'workflow.rename_undo': 'Undo file renaming',
  'workflow.handoff': 'Open document',
  'workflow.notify': 'Show a completion notification',
  'processing.start': 'Process documents locally',
  'processing.cancel': 'Cancel document processing',
  'device.power_policy': 'Change background power settings',
};
export function desktopActionLabel(operation: string) {
  return actions[operation] ?? 'Use your desktop';
}

const labels: Record<string, string> = {
  title: 'Name',
  name: 'Name',
  folder: 'Folder',
  prompt: 'Instructions',
  extensions: 'File types',
  enabled: 'Watching enabled',
  dueAt: 'Reminder time',
  durationSeconds: 'Duration',
  message: 'Reminder message',
  body: 'Message',
  path: 'File or folder',
  paths: 'Documents',
  outputPath: 'Save result to',
  modelPath: 'Local transcription model',
  kind: 'Processing',
  targets: 'Open these items',
  entries: 'File names',
  from: 'Current name',
  to: 'New name',
  pauseOnBattery: 'Pause background work on battery',
  application: 'Application',
  window: 'Window',
  element: 'Control',
  action: 'Action',
  text: 'Text to enter',
  key: 'Key',
};
const internal = new Set([
  'selectionId',
  'snapshotId',
  'elementIndex',
  'pid',
  'windowId',
  'operation',
  'id',
  'fileId',
  'activityId',
  'sourceActivityId',
  'ticket',
  'requestId',
  'resourceId',
  'work',
  'status',
  'completed',
]);
const processors: Record<string, string> = {
  index: 'Document indexing',
  ocr: 'Read text from images',
  transcribe: 'Audio transcription',
  convert: 'Document conversion',
};

function fieldValue(key: string, value: unknown): unknown {
  if (key === 'durationSeconds' && typeof value === 'number') {
    if (value % 60 === 0) return `${value / 60} minutes`;
    return `${value} seconds`;
  }
  if (key === 'dueAt' && typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }
  if (key === 'kind' && typeof value === 'string') return processors[value] ?? value;
  return desktopReviewFields(value);
}

/** Keep the approved payload intact; only its presentation hides transport identifiers. */
export function desktopReviewFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(desktopReviewFields);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !internal.has(key))
      .map(([key, child]) => [labels[key] ?? key, fieldValue(key, child)]),
  );
}
