import { useEffect, useState } from 'react';

let renderQueue: Promise<unknown> = Promise.resolve();
let nextId = 0;
async function diagram(source: string, dark: boolean): Promise<string> {
  // Never let model text change Mermaid's security configuration.
  if (source.length > 20_000 || /%%\s*\{|^\s*---/m.test(source))
    throw new Error('Diagram configuration is not supported.');
  const pending = renderQueue.then(async () => {
    const { default: mermaid } = await import('mermaid');
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: dark ? 'dark' : 'neutral',
      suppressErrorRendering: true,
      maxTextSize: 20_000,
      maxEdges: 200,
      flowchart: { htmlLabels: false },
      htmlLabels: false,
    });
    const id = `dext-diagram-${++nextId}`;
    try {
      const { svg } = await mermaid.render(id, source);
      // Isolated image documents cannot execute scripts or fetch nested external resources.
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    } finally {
      document.getElementById(id)?.remove();
      document.getElementById('d' + id)?.remove();
    }
  });
  renderQueue = pending.catch(() => {});
  return pending;
}
export function Diagram({ source, streaming }: { source: string; streaming?: boolean }) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () =>
      setDark(
        document.documentElement.dataset.theme === 'dark' ||
          (document.documentElement.dataset.theme !== 'light' && media.matches),
      );
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    media.addEventListener('change', update);
    update();
    return () => {
      observer.disconnect();
      media.removeEventListener('change', update);
    };
  }, []);
  const [result, setResult] = useState<{ source: string; image?: string; error?: boolean }>();
  useEffect(() => {
    let active = true;
    const timer = setTimeout(
      () => {
        void diagram(source, dark).then(
          (image) => {
            if (active) setResult({ source, image });
          },
          () => {
            if (active) setResult({ source, error: true });
          },
        );
      },
      streaming ? 400 : 0,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [source, streaming, dark]);
  const current = result?.source === source ? result : undefined;
  return (
    <figure className="rich-figure rich-diagram">
      <figcaption>Diagram</figcaption>
      {current?.image ? (
        <div className="diagram-canvas" tabIndex={0} role="region" aria-label="Diagram canvas">
          <img src={current.image} alt="Diagram" />
        </div>
      ) : (
        <p className="rich-notice">
          {current?.error && !streaming
            ? 'This diagram could not be rendered. Its source is available below.'
            : 'Drawing diagram…'}
        </p>
      )}
      <details>
        <summary>View diagram source</summary>
        <pre>
          <code>{source}</code>
        </pre>
      </details>
    </figure>
  );
}
