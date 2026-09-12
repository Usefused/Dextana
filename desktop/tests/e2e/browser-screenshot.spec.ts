import { test, expect } from '@playwright/test';
import { UserBrowser } from '../../src/main/user-browser';
import { browserFixture } from '../helpers/user-browser';

test('attached browser maps screenshot points at zoom and rejects stale or wrong-tab input', async () => {
  test.setTimeout(90_000);
  const fixture = await browserFixture({
    html: `<!doctype html><title>Visual targets</title>
    <style>body{margin:0;height:3000px}canvas{position:absolute;left:40px;top:100px;background:green}</style>
    <canvas width="80" height="60"></canvas><script>
    window.events=[];document.querySelector('canvas').onclick=e=>events.push({x:e.clientX,y:e.clientY,trusted:e.isTrusted});
    </script>`,
  });
  const browser = new UserBrowser(`chrome-extension://${fixture.id}`, () => {});
  const run = async (args: Record<string, unknown>) =>
    browser.execute(
      'visual',
      browser.prepare('visual', args),
      new AbortController().signal,
    ) as Promise<any>;
  try {
    const second = await fixture.context.newPage();
    await second.goto(fixture.origin + '/other');
    const pairing = await browser.begin('visual', 'Visual targeting');
    await fixture.attach(pairing.code, [fixture.page.url(), second.url()]);
    const tabs = (await run({ action: 'list_tabs' })).tabs;
    const tab = tabs.find((t: any) => t.url === fixture.page.url()).tab_id;
    const other = tabs.find((t: any) => t.tab_id !== tab).tab_id;
    await fixture.worker.evaluate(async (url) => {
      const api = (globalThis as any).chrome;
      const tab = (await api.tabs.query({})).find((t: any) => t.url === url);
      await api.tabs.setZoom(tab.id, 1.5);
    }, fixture.page.url());
    // Foreground selection must never redirect input from the captured tab.
    await second.bringToFront();
    for (const coordinate_space of ['screenshot', 'normalized']) {
      const shot = await run({ action: 'screenshot', tab_id: tab });
      expect(shot.error).toBeUndefined();
      expect(shot.screenshot_size.width).toBeGreaterThan(shot.viewport.width);
      const sx = coordinate_space === 'normalized' ? 1 : shot.screenshot_size.width;
      const sy = coordinate_space === 'normalized' ? 1 : shot.screenshot_size.height;
      const args = {
        action: 'click',
        tab_id: tab,
        screenshot_id: shot.screenshot_id,
        coordinate_space,
        x: (80 / shot.viewport.width) * sx,
        y: (130 / shot.viewport.height) * sy,
      };
      expect((await run(args)).error).toBeUndefined();
      expect((await run(args)).error).toContain('stale');
    }
    expect(await fixture.page.evaluate(() => (window as any).events)).toEqual([
      { x: 80, y: 130, trusted: true },
      { x: 80, y: 130, trusted: true },
    ]);
    expect(await second.evaluate(() => (window as any).events)).toEqual([]);
    const shot = await run({ action: 'screenshot', tab_id: tab });
    const args = {
      action: 'click',
      tab_id: tab,
      screenshot_id: shot.screenshot_id,
      coordinate_space: 'normalized',
      x: 0.1,
      y: 0.2,
    };
    expect((await run({ ...args, tab_id: other })).error).toContain('stale');
    await fixture.page.evaluate(() => {
      document.querySelector('canvas')!.style.left = '200px';
    });
    expect((await run(args)).error).toContain('stale');
    const scrolled = await run({ action: 'screenshot', tab_id: tab });
    await fixture.page.evaluate(() => scrollTo(0, 100));
    expect((await run({ ...args, screenshot_id: scrolled.screenshot_id })).error).toContain(
      'stale',
    );
    expect(await fixture.page.evaluate(() => (window as any).events.length)).toBe(2);
  } finally {
    browser.close();
    await fixture.close();
  }
});
