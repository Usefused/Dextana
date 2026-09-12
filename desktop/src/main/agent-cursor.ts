export const agentCursorWidth = 36;
export const agentCursorHeight = 36;
export const agentCursorHotspot = { x: 18, y: 18 } as const;

/** Compact Dext locator shared by web content and native desktop overlays. */
export const agentCursorMarkup =
  '<span style="display:block;position:relative;width:36px;height:36px"><span data-dextana-cursor-mark style="position:absolute;left:9px;top:9px;display:grid;place-items:center;width:18px;height:18px;border:1px solid #f5faf3;border-radius:50%;background:#3d654c;color:#f5faf3;box-shadow:0 0 0 1px #31543f,0 3px 10px #365f4c99;font:650 9px/1 -apple-system,BlinkMacSystemFont,\'IBM Plex Sans\',sans-serif">D</span></span>';
