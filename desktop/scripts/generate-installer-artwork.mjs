import { Resvg } from '@resvg/resvg-js';
import { readFile, writeFile } from 'node:fs/promises';

// Run on macOS when editing the artwork; committed PNGs are used by CI.
// The font is rendered into the image, so installation needs no external fonts.
const fontFile = '/System/Library/Fonts/HelveticaNeue.ttc';
await readFile(fontFile);
const svg = await readFile('assets/dmg-background.svg', 'utf8');
for (const scale of [1, 2]) {
  const renderer = new Resvg(svg, {
    fitTo: { mode: 'zoom', value: scale },
    font: { loadSystemFonts: false, fontFiles: [fontFile] },
  });
  await writeFile(
    `assets/dmg-background${scale === 2 ? '@2x' : ''}.png`,
    renderer.render().asPng(),
  );
}
