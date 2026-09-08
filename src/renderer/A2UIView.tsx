import { UIReference, ReferenceText } from './UIReference';
import { type ReactNode } from 'react';
import { boundValue, parseA2UI, type UISurface } from './a2ui';

function renderSurface(surface: UISurface) {
  let count = 0;
  function render(id: unknown, ancestors: string[] = []): ReactNode {
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
        return (
          <p key={id} className={`ui-text ui-${variant}`}>
            <ReferenceText text={String(text ?? '')} />
          </p>
        );
      }
      case 'Reference': {
        const target = boundValue(component.target, surface.data);
        const label = boundValue(component.label, surface.data);
        if (typeof target !== 'string' || target.length > 4096 || (label !== undefined && typeof label !== 'string')) throw new Error('Invalid reference.');
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
          <div key={id} className="ui-card">
            {render(component.child, branch)}
          </div>
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
export function A2UIView({ source, streaming = false }: { source: string; streaming?: boolean }) {
  const result = parseA2UI(source);
  let content: ReactNode;
  let error = result?.error;
  try {
    if (!error) content = result?.surfaces.map(renderSurface);
  } catch (failure) {
    error = (failure as Error).message;
  }
  return (
    <div className="a2ui-view">
      {error ? <p className="ui-notice">I couldn’t display this result. Ask me for a plain-language summary instead.</p> : content}
      {(!result || result.pending) && (
        <p className="ui-pending">
          {streaming ? 'Preparing results…' : 'This result is incomplete. Ask me to summarize it again.'}
        </p>
      )}

    </div>
  );
}
