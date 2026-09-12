import { Button } from './ui';
import { Fragment, useEffect, useId, useState } from 'react';
import type { Message } from '../shared/types';

export function Thought({
  thought,
  pending,
}: {
  thought: NonNullable<Message['thought']>;
  pending: boolean;
}) {
  const steps = (thought.steps?.length ? thought.steps : [thought.text])
    .flatMap(phase => phase.split(/\n\s*\n/)).map(step => step.trim()).filter(Boolean);
  const live = thought.runningSince !== undefined;
  const thinking = live || pending;
  const [expanded, setExpanded] = useState(thinking);
  const [now, setNow] = useState(Date.now());
  const contentId = useId();
  useEffect(() => {
    setExpanded(thinking);
  }, [thinking]);
  useEffect(() => {
    if (!live) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [live]);
  const elapsed = thought.durationMs + (live ? Math.max(0, now - thought.runningSince!) : 0);
  const seconds = Math.max(1, Math.ceil(elapsed / 1000));
  const duration = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return (
    <div className="thought">
      <Button variant="layout"
        className="thought-toggle"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((value) => !value)}
      >
        <span aria-hidden="true">{expanded ? '⌄' : '›'}</span>{' '}
        {thinking ? `Thinking · ${duration}` : `Thought for ${duration}`}
      </Button>
      <div
        id={contentId}
        data-testid="thought-content"
        className="thought-content"
        hidden={!expanded}
      >
        <ol className="thought-steps">
          {steps.map((step, index) => <Fragment key={index}><li className="thought-step">{step}</li>{'\n'}</Fragment>)}
        </ol>
      </div>
    </div>
  );
}
