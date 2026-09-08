const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { Arch } = require('builder-util');
module.exports = async (context) => {
  const metadata = JSON.parse(
    await readFile(join(context.packager.projectDir, '.build/backend/build.json'), 'utf8'),
  );
  if (metadata.platform !== context.electronPlatformName || metadata.arch !== Arch[context.arch]) {
    throw new Error(
      'The compiled backend must match the installer platform and architecture. Build each installer on its matching native CI runner.',
    );
  }
};
