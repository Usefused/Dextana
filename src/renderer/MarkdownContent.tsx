import { Button } from './ui';
import { Children, isValidElement, useMemo, useState, type ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { externalURL } from '../shared/links';
import { rasterDataURL } from '../shared/images';
import { UIReference } from './UIReference';
import { RichImage } from './RichImage';
import { RichChart } from './RichChart';
import { TableFrame } from './RichTable';
import { Diagram } from './Diagram';

function WebLink({ href, children }: { href?: string; children?: ReactNode }) {
  const [error, setError] = useState('');
  if (!href) return <span>{children}</span>;
  return (
    <>
      <a
        href={href}
        onClick={(event) => {
          event.preventDefault();
          void window.dextana.openLink(href).catch(() => setError('Could not open this link.'));
        }}
      >
        {children}
      </a>
      {error && <span role="alert">{error}</span>}
    </>
  );
}
function CodeBlock({ source, language }: { source: string; language: string }) {
  const [status, setStatus] = useState('Copy code');
  return (
    <div className="rich-code">
      <div className="code-toolbar">
        <span>{language || 'Plain text'}</span>
        <Button variant="layout"
          onClick={async () => {
            try {
              await window.dextana.copyText(source);
              setStatus('Copied');
            } catch {
              setStatus('Copy failed');
            }
          }}
          onBlur={() => setStatus('Copy code')}
        >
          {status}
        </Button>
      </div>
      <pre>
        <code>{source}</code>
      </pre>
    </div>
  );
}
function Block({
  children,
  streaming,
  renderUI,
}: {
  children?: ReactNode;
  streaming?: boolean;
  renderUI?: (source: string) => ReactNode;
}) {
  const child = Children.toArray(children)[0];
  if (!isValidElement<{ className?: string; children?: ReactNode }>(child))
    return <pre>{children}</pre>;
  const language = child.props.className?.replace(/^language-/, '').toLowerCase() || '';
  const source = String(child.props.children ?? '').replace(/\n$/, '');
  if (language === 'a2ui' && renderUI) return renderUI(source);
  if (language === 'mermaid') return <Diagram source={source} streaming={streaming} />;
  if (language === 'chart') {
    let value: unknown;
    try {
      value = JSON.parse(source);
    } catch {
      return (
        <p className="rich-notice">
          {streaming ? 'Preparing chart…' : 'This chart contains incomplete or invalid data.'}
        </p>
      );
    }
    return <RichChart value={value} />;
  }
  return <CodeBlock key={source} source={source} language={language} />;
}
export function MarkdownContent({
  content,
  streaming = false,
  renderUI,
  references = false,
  inline = false,
}: {
  content: string;
  streaming?: boolean;
  renderUI?: (source: string) => ReactNode;
  references?: boolean;
  inline?: boolean;
}) {
  const components = useMemo<Components>(() => ({
          a: ({ href, children }) =>
            references && href ? (
              <UIReference
                target={href}
                label={typeof children === 'string' ? children : undefined}
              />
            ) : (
              <WebLink href={href}>{children}</WebLink>
            ),
          img: ({ src, alt }) => (
            <RichImage key={src} src={typeof src === 'string' ? src : ''} alt={alt || 'Image'} />
          ),
          pre: ({ children }) => (
            <Block streaming={streaming} renderUI={renderUI}>
              {children}
            </Block>
          ),
          table: ({ children }) => (
            <TableFrame>
              <table>{children}</table>
            </TableFrame>
          ),
        }), [references, streaming, renderUI]);
  const Wrapper = inline ? 'span' : 'div';
  return (
    <Wrapper className="markdown rich-markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        allowedElements={inline ? ['em', 'strong', 'del', 'code', 'a', 'br'] : undefined}
        unwrapDisallowed={inline}
        urlTransform={(url, key) =>
          key === 'src'
            ? externalURL(url) || (rasterDataURL(url) ? url : '')
            : externalURL(url) ||
              (references &&
              !/^[a-z][a-z\d+.-]*:/i.test(url) &&
              /\.(?:pdf|docx?|xlsx?|csv|txt|md|pptx?|zip|png|jpe?g)$/i.test(url)
                ? url
                : '')
        }
        components={components}
      >
        {content}
      </Markdown>
    </Wrapper>
  );
}
