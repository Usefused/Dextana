const pdfOrigin = 'chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/';

export function browserResourceAllowed(url: string, frameURL = '', resourceType = '') {
  const parsed = new URL(url);
  if (['https:', 'http:', 'data:', 'blob:', 'about:', 'ws:', 'wss:'].includes(parsed.protocol)) return true;
  if (url.startsWith(pdfOrigin)) return true;
  // PDF viewer modules import Chromium's bundled UI resources. Permit them only
  // as subresources of that built-in viewer, never as remote-page navigation.
  return parsed.protocol === 'chrome:' && parsed.hostname === 'resources'
    && frameURL.startsWith(pdfOrigin) && !['mainFrame', 'subFrame'].includes(resourceType);
}
