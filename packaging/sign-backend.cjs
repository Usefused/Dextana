const { readdir } = require('node:fs/promises');
const { join } = require('node:path');

// electron-builder signs app.asar.unpacked, but the private backend is a separate
// extraResource. Include all its Windows native code in publisher signing.
module.exports = async (context) => {
  if (context.electronPlatformName !== 'win32') return;
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && /\.(exe|dll|pyd)$/i.test(entry.name))
        await context.packager.signIf(path);
    }
  }
  await walk(join(context.appOutDir, 'resources', 'backend'));
};
