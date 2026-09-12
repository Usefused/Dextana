import { afterEach, expect, test, vi } from 'vitest';
import { loadImage } from '../../src/main/images';
import { rasterDataURL, imageLimit } from '../../src/shared/images';
import { chartData } from '../../src/renderer/RichChart';

afterEach(() => vi.unstubAllGlobals());
test('image broker validates schemes, raster bytes, media types and size before display', async () => {
  const request = vi.fn();
  vi.stubGlobal('fetch', request);
  for (const url of [
    'file:///etc/passwd',
    'javascript:alert(1)',
    'https://user:secret@example.com/a.png',
    1,
  ])
    await expect(loadImage(url)).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
  request.mockResolvedValueOnce(
    new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }),
  );
  await expect(loadImage('https://example.com/a')).rejects.toThrow('supported image');
  request.mockResolvedValueOnce(
    new Response('<html/>', { headers: { 'content-type': 'image/png' } }),
  );
  await expect(loadImage('https://example.com/a')).rejects.toThrow('format');
  request.mockResolvedValueOnce(
    new Response('', {
      headers: { 'content-type': 'image/png', 'content-length': String(imageLimit + 1) },
    }),
  );
  await expect(loadImage('https://example.com/a')).rejects.toThrow('5 MB');
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  request.mockResolvedValueOnce(new Response(bytes, { headers: { 'content-type': 'image/png' } }));
  expect(await loadImage('https://example.com/a')).toBe('data:image/png;base64,iVBORw0KGgo=');
  expect(request).toHaveBeenLastCalledWith(
    'https://example.com/a',
    expect.objectContaining({ credentials: 'omit', redirect: 'error' }),
  );
  expect(rasterDataURL('data:image/svg+xml;base64,PHN2Zy8+')).toBe(false);
});
test('image streams are bounded even without a content-length header', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(imageLimit));
            controller.enqueue(new Uint8Array(1));
            controller.close();
          },
        }),
        { headers: { 'content-type': 'image/png' } },
      ),
    ),
  );
  await expect(loadImage('https://example.com/a')).rejects.toThrow('5 MB');
});
test('chart data rejects non-finite numbers and mismatched or unbounded series', () => {
  const c = {
    title: 'Trend',
    type: 'line',
    labels: ['A', 'B'],
    series: [{ name: 'Values', values: [-2, 3] }],
  };
  expect(chartData(c)).toEqual(c);
  for (const values of [[1], [NaN, 2], [Infinity, 2], ['2', 3]])
    expect(chartData({ ...c, series: [{ name: 'Values', values }] })).toBeUndefined();
  expect(chartData({ ...c, labels: Array(41).fill('A') })).toBeUndefined();
});
