import { expect, test, vi } from 'vitest';
import { BrowserScreenshots, type ViewportGeometry } from '../../src/shared/browser-screenshot';
const geometry: ViewportGeometry = {
  document: 'document-a',
  revision: 0,
  url: 'https://example.com',
  width: 800,
  height: 600,
  scrollX: 0,
  scrollY: 0,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};
function setup(width = 1600, height = 1200) {
  const screenshots = new BrowserScreenshots();
  const png = Buffer.alloc(24);
  png.writeUInt32BE(width, 16);
  png.writeUInt32BE(height, 20);
  const metadata = screenshots.capture('tab-a', png, geometry, geometry);
  return { screenshots, metadata, png };
}
test('maps actual screenshot pixels and resized-image normalized points to CSS viewport coordinates', () => {
  const { screenshots, metadata } = setup();
  expect(metadata.screenshot_size).toEqual({ width: 1600, height: 1200 });
  expect(
    screenshots.point(
      'tab-a',
      { screenshot_id: metadata.screenshot_id, coordinate_space: 'screenshot', x: 1200, y: 300 },
      geometry,
    ),
  ).toEqual({ x: 600, y: 150 });
  const normalized = setup(1000, 750);
  expect(
    normalized.screenshots.point(
      'tab-a',
      {
        screenshot_id: normalized.metadata.screenshot_id,
        coordinate_space: 'normalized',
        x: 0.75,
        y: 0.25,
      },
      geometry,
    ),
  ).toEqual({ x: 600, y: 150 });
});
test('rejects stale, wrong-tab, replayed and out-of-image coordinates', () => {
  for (const patch of [
    { width: 900 },
    { scrollY: 100 },
    { document: 'reloaded' },
    { revision: 1 },
    { scale: 2 },
  ]) {
    const { screenshots, metadata } = setup();
    expect(() =>
      screenshots.point(
        'tab-a',
        { screenshot_id: metadata.screenshot_id, coordinate_space: 'normalized', x: 0.5, y: 0.5 },
        { ...geometry, ...patch },
      ),
    ).toThrow('stale');
  }
  for (const point of [
    { x: 1, y: 0.5 },
    { x: NaN, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: Infinity },
  ]) {
    const { screenshots, metadata } = setup();
    expect(() =>
      screenshots.point(
        'tab-a',
        { screenshot_id: metadata.screenshot_id, coordinate_space: 'normalized', ...point },
        geometry,
      ),
    ).toThrow('inside');
  }
  const { screenshots, metadata } = setup();
  const args = {
    screenshot_id: metadata.screenshot_id,
    coordinate_space: 'normalized',
    x: 0.5,
    y: 0.5,
  };
  expect(() => screenshots.point('tab-b', args, geometry)).toThrow('another tab');
  screenshots.point('tab-a', args, geometry);
  expect(() => screenshots.point('tab-a', args, geometry)).toThrow('stale');
});
test('rejects expired and moving captures', () => {
  const { screenshots, metadata, png } = setup();
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 61000);
  try {
    expect(() =>
      screenshots.point('tab-a', { screenshot_id: metadata.screenshot_id }, geometry),
    ).toThrow('stale');
  } finally {
    clock.mockRestore();
  }
  expect(() => screenshots.capture('tab-a', png, geometry, { ...geometry, revision: 2 })).toThrow(
    'moved',
  );
});
