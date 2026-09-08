import { readableResponse } from '../shared/readable-results';
import { useState, type ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { A2UIView } from './A2UIView';
import { externalURL } from '../shared/links';

function WebLink({ href, children }: { href?: string; children?: ReactNode }) {
  const [error, setError] = useState('');
  if (!href) return <span>{children}</span>;
  return (
    <>
      <a
        href={href}
        onClick={(event) => {
          event.preventDefault();
          void window.dextana.openLink(href).catch((failure) => setError(failure.message));
        }}
      >
        {children}
      </a>
      {error && <span role="alert">{error}</span>}
    </>
  );
}
export function MessageContent({
  content,
  streaming = false,
}: {
  content: string;
  streaming?: boolean;
}) {
  const rawUI =
    /^[\s]*[\[{]/.test(content) &&
    /"(?:createSurface|surfaceUpdate|beginRendering)"\s*:/.test(content);
  if (rawUI) return <A2UIView source={content} streaming={streaming} />;
  return (
    <div className="markdown">
      <Markdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        urlTransform={(url) => externalURL(url) ?? ''}
        components={{
          a: ({ href, children }) => <WebLink href={href}>{children}</WebLink>,
          img: ({ alt, src }) => <WebLink href={src}>[Image: {alt || 'image'}]</WebLink>,
          pre: ({ children }) => <div className="code-block">{children}</div>,
          code: ({ className, children }) =>
            className === 'language-a2ui' ? (
              <A2UIView source={String(children)} streaming={streaming} />
            ) : (
              <code className={className}>{children}</code>
            ),
          table: ({ children }) => (
            <div className="markdown-table">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {readableResponse(content, streaming)}
      </Markdown>
    </div>
  );
}
