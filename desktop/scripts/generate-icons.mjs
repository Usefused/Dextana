import { Resvg } from '@resvg/resvg-js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
await mkdir('assets', { recursive: true });
const svg = await readFile('assets/icon.svg', 'utf8');
const png = (size) =>
  new Resvg(svg, { fitTo: { mode: 'width', value: size }, font: { loadSystemFonts: false } })
    .render()
    .asPng();
await writeFile('assets/icon.png', png(1024));
const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = sizes.map(png);
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
for (let i = 0; i < sizes.length; i++) {
  const at = 6 + i * 16;
  header[at] = header[at + 1] = sizes[i] === 256 ? 0 : sizes[i];
  header.writeUInt16LE(1, at + 4);
  header.writeUInt16LE(32, at + 6);
  header.writeUInt32LE(images[i].length, at + 8);
  header.writeUInt32LE(offset, at + 12);
  offset += images[i].length;
}
await writeFile('assets/icon.ico', Buffer.concat([header, ...images]));
const chunks = [
  ['icp4', 16],
  ['icp5', 32],
  ['icp6', 64],
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024],
].map(([type, size]) => {
  const data = png(size);
  const chunk = Buffer.alloc(8);
  chunk.write(type);
  chunk.writeUInt32BE(data.length + 8, 4);
  return Buffer.concat([chunk, data]);
});
const icns = Buffer.alloc(8);
icns.write('icns');
icns.writeUInt32BE(8 + chunks.reduce((n, c) => n + c.length, 0), 4);
await writeFile('assets/icon.icns', Buffer.concat([icns, ...chunks]));
