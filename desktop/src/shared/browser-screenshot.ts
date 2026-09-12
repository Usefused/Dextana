export type ViewportGeometry = {
  revision: number;
  document: string;
  url: string;
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
  scale: number;
  offsetX: number;
  offsetY: number;
};
type Capture = {
  id: string;
  at: number;
  geometry: ViewportGeometry;
  width: number;
  height: number;
};

// An isolated-world document identity changes even on same-URL reloads.
export const screenshotGeometry = `(() => {
  if (!globalThis.__dextanaScreenshotState) {
    const state = { document: crypto.randomUUID(), revision: 0 };
    const relevant = records => records.some(record => {
      const element = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      if (element?.closest('[data-dextana-cursor]')) return false;
      const nodes = [...record.addedNodes, ...record.removedNodes];
      return !nodes.length || !nodes.every(node => node.nodeType === 1 && node.matches('[data-dextana-cursor]'));
    });
    state.consume = records => { if (relevant(records)) state.revision++; };
    state.observer = new MutationObserver(state.consume);
    state.observer.observe(document, {subtree:true, childList:true, attributes:true, characterData:true});
    addEventListener('scroll', () => state.revision++, true);
    addEventListener('resize', () => state.revision++);
    globalThis.__dextanaScreenshotState = state;
  }
  const state = globalThis.__dextanaScreenshotState;
  state.consume(state.observer.takeRecords());
  const v = visualViewport;
  return { document: state.document, revision: state.revision, url: location.href,
    width: innerWidth, height: innerHeight, scrollX, scrollY,
    scale: v?.scale ?? 1, offsetX: v?.offsetLeft ?? 0, offsetY: v?.offsetTop ?? 0 };
})()`;

export class BrowserScreenshots {
  private captures = new Map<string, Capture>();
  invalidate(tab: string) {
    this.captures.delete(tab);
  }
  capture(tab: string, png: Uint8Array, before: ViewportGeometry, after: ViewportGeometry) {
    this.invalidate(tab);
    if (JSON.stringify(before) !== JSON.stringify(after))
      throw new Error('The page moved while capturing. Take another screenshot.');
    if (after.scale !== 1 || after.offsetX !== 0 || after.offsetY !== 0)
      throw new Error('Reset pinch zoom before taking a targeting screenshot.');
    // NativeImage sizes can be device-independent; the PNG contains the actual model-visible pixel dimensions.
    const header = new DataView(png.buffer, png.byteOffset, png.byteLength);
    const width = header.getUint32(16),
      height = header.getUint32(20);
    if (!width || !height || after.width <= 0 || after.height <= 0)
      throw new Error('Invalid screenshot dimensions.');
    const capture = { id: crypto.randomUUID(), at: Date.now(), geometry: after, width, height };
    this.captures.set(tab, capture);
    return {
      screenshot_id: capture.id,
      screenshot_size: { width, height },
      viewport: { width: after.width, height: after.height },
      coordinate_mapping: {
        screenshot_to_viewport_x: after.width / width,
        screenshot_to_viewport_y: after.height / height,
      },
      targeting:
        'For click/hover/scroll use screenshot_id and coordinate_space="screenshot" for pixels in this image, or "normalized" for x/y fractions from 0 to less than 1. Normalized points also work on proportionally resized views of the complete image. Take a fresh screenshot after input, scrolling, navigation, resize, or page changes.',
    };
  }
  point(tab: string, args: Record<string, unknown>, geometry: ViewportGeometry) {
    const capture = this.captures.get(tab);
    // Every screenshot action is single-use, including failed validation.
    this.invalidate(tab);
    if (
      !capture ||
      capture.id !== args.screenshot_id ||
      Date.now() - capture.at > 60_000 ||
      JSON.stringify(capture.geometry) !== JSON.stringify(geometry)
    )
      throw new Error(
        'This screenshot is stale or belongs to another tab. Take a fresh screenshot before acting.',
      );
    const normalized = args.coordinate_space === 'normalized';
    if (!normalized && args.coordinate_space !== 'screenshot')
      throw new Error('Choose screenshot or normalized coordinates.');
    const width = normalized ? 1 : capture.width,
      height = normalized ? 1 : capture.height;
    const { x, y } = args;
    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      x < 0 ||
      y < 0 ||
      x >= width ||
      y >= height
    )
      throw new Error('Choose a point inside the screenshot.');
    return { x: (x / width) * geometry.width, y: (y / height) * geometry.height };
  }
}
