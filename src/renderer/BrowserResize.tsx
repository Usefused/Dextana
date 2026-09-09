import { useLayoutEffect, useRef, useState } from 'react';
import { browserLayout } from '../shared/browser-layout';

const storageKey = 'dextana.browser-width';
function savedWidth() {
  try {
    const value = Number(localStorage.getItem(storageKey));
    return Number.isFinite(value) && value >= 320 && value <= 16384 ? value : undefined;
  } catch { return undefined; }
}

export function BrowserResize() {
  const handle = useRef<HTMLDivElement>(null);
  const preferred = useRef(savedWidth());
  const drag = useRef<{ x: number; width: number } | undefined>(undefined);
  const [layout, setLayout] = useState(() => browserLayout(window.innerWidth, preferred.current));
  const [dragging, setDragging] = useState(false);
  function sync(isDragging = !!drag.current) {
    const next = browserLayout(window.innerWidth, preferred.current);
    handle.current?.closest<HTMLElement>('.shell')?.style.setProperty('--browser-width', `${next.width}px`);
    setLayout(next);
    // The native surface yields pointer events while the divider is being dragged.
    void window.dextana.resizeBrowser(preferred.current, isDragging);
  }
  function save() {
    try {
      if (preferred.current === undefined) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, String(preferred.current));
    } catch { /* Resizing still works if browser preferences cannot be saved. */ }
  }
  function finish() {
    drag.current = undefined;
    setDragging(false);
    document.documentElement.classList.remove('resizing-browser');
    sync(false);
    save();
  }
  useLayoutEffect(() => {
    const resize = () => sync();
    const shell = handle.current?.closest<HTMLElement>('.shell');
    sync(false);
    window.addEventListener('resize', resize);
    window.addEventListener('blur', finish);
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('blur', finish);
      document.documentElement.classList.remove('resizing-browser');
      shell?.style.removeProperty('--browser-width');
      void window.dextana.resizeBrowser(preferred.current, false);
    };
  }, []);
  return <div
    ref={handle}
    className={`browser-resize${dragging ? ' is-dragging' : ''}`}
    role="separator"
    tabIndex={0}
    aria-label="Resize browser"
    aria-orientation="vertical"
    aria-valuemin={layout.min}
    aria-valuemax={layout.max}
    aria-valuenow={layout.width}
    aria-valuetext={`${layout.width} pixels`}
    title="Drag to resize · Double-click to reset"
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { x: event.clientX, width: layout.width };
      setDragging(true);
      document.documentElement.classList.add('resizing-browser');
      sync(true);
    }}
    onPointerMove={event => {
      if (!drag.current) return;
      preferred.current = browserLayout(window.innerWidth, drag.current.width + drag.current.x - event.clientX).width;
      sync(true);
    }}
    onPointerUp={finish}
    onPointerCancel={finish}
    onLostPointerCapture={() => { if (drag.current) finish(); }}
    onDoubleClick={() => { preferred.current = undefined; sync(false); save(); }}
    onKeyDown={event => {
      const step = event.shiftKey ? 80 : 20;
      const width = event.key === 'ArrowLeft' ? layout.width + step
        : event.key === 'ArrowRight' ? layout.width - step
        : event.key === 'Home' ? layout.min : event.key === 'End' ? layout.max : undefined;
      if (width === undefined) return;
      event.preventDefault();
      preferred.current = browserLayout(window.innerWidth, width).width;
      sync(false);
      save();
    }}
  />;
}
