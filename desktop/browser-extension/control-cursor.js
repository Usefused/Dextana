/* Runs in the extension's isolated world. Page scripts can see only the inert host. */
function dextanaControlCursor(x, y, animate) {
  function coordinate(value, maximum) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < maximum;
  }
  if (!coordinate(x, innerWidth) || !coordinate(y, innerHeight))
    throw new Error('Choose a cursor point inside the browser viewport.');
  const key = '__dextanaUserBrowserCursor';
  let host = globalThis[key];
  if (!host?.isConnected) {
    host = document.createElement('span');
    host.setAttribute('data-dextana-cursor', '');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText =
      'position:fixed;left:24px;top:30px;display:block;width:36px;height:36px;z-index:2147483647;pointer-events:none;transform-origin:center;transition:left 260ms cubic-bezier(.22,.8,.3,1),top 260ms cubic-bezier(.22,.8,.3,1)';
    const shadow = host.attachShadow({ mode: 'closed' });
    const frame = document.createElement('span');
    frame.style.cssText = 'display:block;position:relative;width:36px;height:36px';
    const mark = document.createElement('span');
    mark.textContent = 'D';
    mark.style.cssText =
      "position:absolute;left:9px;top:9px;display:grid;place-items:center;width:18px;height:18px;border:1px solid #f5faf3;border-radius:50%;background:#3d654c;color:#f5faf3;box-shadow:0 0 0 1px #31543f,0 3px 10px #365f4c99;font:650 9px/1 -apple-system,BlinkMacSystemFont,'IBM Plex Sans',sans-serif";
    frame.append(mark);
    shadow.append(frame);
    document.documentElement.append(host);
    globalThis[key] = host;
  }
  host.style.left = `${x - 18}px`;
  host.style.top = `${y - 18}px`;
  globalThis.__dextanaUserBrowserCursorMotion?.cancel();
  if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches)
    globalThis.__dextanaUserBrowserCursorMotion = host.animate(
      [
        { transform: 'translateY(1px) scale(.88)', opacity: 0.72 },
        { transform: 'translateY(0) scale(1)', opacity: 1 },
      ],
      { duration: 260, easing: 'cubic-bezier(.22,.8,.3,1)' },
    );
}
