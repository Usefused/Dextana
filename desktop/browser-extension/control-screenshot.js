// Capture and validate in the same isolated document used for DOM control.
async function controlScreenshotGeometry(session) {
  return controlEvaluate(session, DextanaScreenshots.screenshotGeometry);
}
function controlScreenshots(session) {
  session.tab.screenshots ??= new DextanaScreenshots.BrowserScreenshots();
  return session.tab.screenshots;
}
async function controlScreenshot(session) {
  const captures = controlScreenshots(session);
  const tab = String(session.tabId);
  captures.invalidate(tab);
  const before = await controlScreenshotGeometry(session);
  const image = await controlCDP(session, 'Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  const after = await controlScreenshotGeometry(session);
  const png = Uint8Array.from(atob(image.data), (char) => char.charCodeAt(0));
  return {
    url: after.url,
    image: { type: 'image', mediaType: 'image/png', data: image.data },
    ...captures.capture(tab, png, before, after),
  };
}
async function controlScreenshotPoint(session, args) {
  const geometry = await controlScreenshotGeometry(session);
  return controlScreenshots(session).point(String(session.tabId), args, geometry);
}

async function controlScreenshotInput(session, args) {
  const point = await controlScreenshotPoint(session, args);
  const mapped = { ...args, ...point };
  delete mapped.screenshot_id;
  return controlInput(session, mapped);
}
