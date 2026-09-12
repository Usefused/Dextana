import { Card } from './ui';
import { UIReference } from './UIReference';
import { createElement, useContext, type ReactNode } from 'react';
import { boundValue, parseA2UI, type UISurface } from './a2ui';
import { MarkdownContent } from './MarkdownContent';
import { RichTable } from './RichTable';
import { RichChart } from './RichChart';
import { RichImage } from './RichImage';
import { Diagram } from './Diagram';
import { A2UIQuestions, QuestionReplyContext, type UIReply } from './A2UIQuestions';
import { questionForm } from './a2ui-questions';

function renderSurface(surface: UISurface, reply?: UIReply) {
  let count = 0;
  function render(id: unknown, ancestors: string[] = []): ReactNode {
    try {
      return renderComponent(id, ancestors);
    } catch (failure) {
      return (
        <p key={typeof id === 'string' ? id : count} className="rich-notice">
          {(failure as Error).message}
        </p>
      );
    }
  }
  function renderComponent(id: unknown, ancestors: string[]): ReactNode {
    if (typeof id !== 'string') throw new Error('Invalid child reference.');
    if (ancestors.includes(id) || ancestors.length > 30 || ++count > 500)
      throw new Error('Invalid or oversized UI tree.');
    const component = surface.components.get(id);
    if (!component)
      return (
        <span key={id} className="ui-pending">
          Loading component…
        </span>
      );
    const branch = [...ancestors, id];
    const children = () => {
      if (!Array.isArray(component.children))
        throw new Error('Only explicit child lists are supported.');
      return component.children.map((child) => render(child, branch));
    };
    switch (component.component) {
      case 'QuestionForm':
        return <A2UIQuestions key={`${id}:${JSON.stringify(component)}`} form={questionForm(component)} reply={reply} />;
      case 'Text': {
        const text = boundValue(component.text, surface.data);
        if (
          text !== undefined &&
          text !== null &&
          !['string', 'number', 'boolean'].includes(typeof text)
        )
          throw new Error('Text must resolve to a scalar value.');
        const variant =
          typeof component.variant === 'string' && /^(h[1-5]|caption|body)$/.test(component.variant)
            ? component.variant
            : 'body';
        if (/^h[1-5]$/.test(variant))
          return createElement(
            variant,
            { key: id, className: `ui-text ui-${variant}` },
            <MarkdownContent content={String(text ?? '')} references inline />,
          );
        return (
          <div key={id} className={`ui-text ui-${variant}`}>
            <MarkdownContent content={String(text ?? '')} references />
          </div>
        );
      }
      case 'Table':
        return (
          <RichTable
            key={id}
            title={typeof component.title === 'string' ? component.title : undefined}
            columns={
              Array.isArray(component.columns)
                ? component.columns
                : boundValue(component.columns, surface.data)
            }
            rows={
              Array.isArray(component.rows)
                ? component.rows
                : boundValue(component.rows, surface.data)
            }
          />
        );
      case 'Chart':
        return (
          <RichChart
            key={id}
            value={{
              ...component,
              labels: Array.isArray(component.labels)
                ? component.labels
                : boundValue(component.labels, surface.data),
              series: Array.isArray(component.series)
                ? component.series
                : boundValue(component.series, surface.data),
            }}
          />
        );
      case 'Image': {
        const src = boundValue(component.url ?? component.src, surface.data);
        const alt = boundValue(component.description ?? component.alt, surface.data);
        return (
          <RichImage
            key={`${id}:${src}`}
            src={typeof src === 'string' ? src : ''}
            alt={typeof alt === 'string' ? alt : 'Image'}
          />
        );
      }
      case 'Diagram': {
        const source = boundValue(component.source, surface.data);
        return <Diagram key={id} source={typeof source === 'string' ? source : ''} />;
      }
      case 'Reference': {
        const target = boundValue(component.target, surface.data);
        const label = boundValue(component.label, surface.data);
        if (
          typeof target !== 'string' ||
          target.length > 4096 ||
          (label !== undefined && typeof label !== 'string')
        )
          throw new Error('Invalid reference.');
        return <UIReference key={id} target={target} label={label as string | undefined} />;
      }
      case 'Row':
      case 'Column':
      case 'List':
        return (
          <div key={id} className={`ui-${component.component.toLowerCase()}`}>
            {children()}
          </div>
        );
      case 'Card':
        return (
          <Card as="div" key={id} className="ui-card">
            {render(component.child, branch)}
          </Card>
        );
      case 'Divider':
        return <hr key={id} />;
      default:
        throw new Error(`Unsupported component: ${component.component}.`);
    }
  }
  return (
    <div className="a2ui-surface" key={surface.id}>
      {render('root')}
    </div>
  );
}
export function A2UIView({ source, streaming = false, reply }: { source: string; streaming?: boolean; reply?: UIReply }) {
  const inheritedReply = useContext(QuestionReplyContext);
  reply ??= inheritedReply;
  const result = parseA2UI(source);
  let content: ReactNode;
  let error = result?.error;
  try {
    if (!error) content = result?.surfaces.map(surface => renderSurface(surface,
      streaming || result.pending ? { ...reply, send: undefined } : reply));
  } catch (failure) {
    error = (failure as Error).message;
  }
  return (
    <div className="a2ui-view">
      {error ? (
        <p className="ui-notice">
          I couldn’t display this result. Ask me for a plain-language summary instead.
        </p>
      ) : (
        content
      )}
      {(!result || result.pending) && (
        <p className="ui-pending">
          {streaming
            ? 'Preparing results…'
            : 'This result is incomplete. Ask me to summarize it again.'}
        </p>
      )}
    </div>
  );
}
