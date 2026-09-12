import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface ExtensionEnvironment {
  packaged: boolean;
  appPath: string;
  resourcesPath: string;
  userData: string;
}
export const extensionFiles = [
  'manifest.json',
  'popup.html',
  'popup.css',
  'popup.js',
  'transfer.js',
  'runtime.js',
  'site-scope.js',
  'site-scope.LICENSE',
  'background.js',
  'control-worker.js',
  'control-session.js',
  'control-downloads.js',
  'control-tabs.js',
  'control-actions.js',
  'control-cursor.js',
  'control-screenshot.js',
  'screenshot-targeting.js',
  'control-page.js',
  'page-semantics.js',
  'control-popup.js',
];
export function extensionSource(environment: ExtensionEnvironment) {
  return join(
    environment.packaged ? environment.resourcesPath : environment.appPath,
    'browser-extension',
  );
}
export async function prepareBrowserExtension(environment: ExtensionEnvironment) {
  const source = extensionSource(environment);
  // Chrome needs ordinary files at a stable location, outside the app archive
  // and independent of where an installer or app update is downloaded.
  const contents = await Promise.all(extensionFiles.map((file) => readFile(join(source, file))));
  const destination = join(environment.userData, 'Browser Extensions', 'Dextana Login');
  await mkdir(destination, { recursive: true });
  await Promise.all(
    extensionFiles.map((file, index) => writeFile(join(destination, file), contents[index])),
  );
  return destination;
}
