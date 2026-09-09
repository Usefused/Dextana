import { SearchSelect, Button, Popover, RangeInput } from './ui';
import { useEffect, useState, type CSSProperties } from 'react';
import type { Reasoning, ReasoningSupport } from '../shared/types';

export function ModelSelector({
  models,
  model,
  reasoning,
  url,
  disabled,
  changeModel,
  changeReasoning,
}: {
  models: string[];
  model: string;
  reasoning: Reasoning;
  url: string;
  disabled?: boolean;
  changeModel: (model: string) => void;
  changeReasoning: (reasoning: Reasoning) => void;
}) {
  const [retry, setRetry] = useState(0);
  const [support, setSupport] = useState<{
    model: string;
    url: string;
    kind: ReasoningSupport | 'error';
  }>();
  useEffect(() => {
    let live = true;
    if (model && url)
      void window.dextana
        .modelReasoning(url, model)
        .then((kind) => {
          if (live) setSupport({ model, url, kind });
        })
        .catch(() => {
          if (live) setSupport({ model, url, kind: 'error' });
        });
    return () => {
      live = false;
    };
  }, [model, url, retry]);
  const resolved = support?.model === model && support.url === url ? support.kind : undefined;
  const kind = typeof resolved === 'object' ? resolved.kind : resolved;
  const preferred: Reasoning =
    kind === 'levels' ? 'medium' : kind === 'extended' || kind === 'toggle' ? 'on' : 'default';
  const choices: Reasoning[] = typeof resolved === 'object' ? resolved.choices :
    kind === 'extended' ? ['off', 'on', 'max'] : kind === 'levels' ? ['low', 'medium', 'high'] : kind === 'toggle' ? ['off', 'on'] : ['default'];
  const requested = reasoning === 'default' ? preferred : reasoning;
  const effective = choices.includes(requested) ? requested : preferred;
  useEffect(() => {
    if (resolved && resolved !== 'error' && reasoning !== effective) changeReasoning(effective);
  }, [resolved, reasoning, effective, changeReasoning]);
  const unavailable = !kind || kind === 'none' || kind === 'unknown' || kind === 'error';
  const caption =
    kind === 'unknown'
      ? 'This provider does not report reasoning controls'
      : kind === 'none'
      ? 'Reasoning unavailable'
      : kind === 'error'
        ? 'Could not check reasoning support'
        : !kind
          ? 'Checking reasoning support'
          : 'Reasoning';
  const label =
    effective === 'default'
      ? kind === 'effort' || kind === 'unknown' ? 'Default' : kind === 'none'
        ? 'Standard'
        : kind === 'error'
          ? 'Unavailable'
          : 'Checking…'
      : effective.charAt(0).toUpperCase() + effective.slice(1);
  const index = Math.max(0, choices.indexOf(effective));
  const progress = choices.length > 1 ? (index / (choices.length - 1)) * 100 : 0;
  return (
    <div className="model-selector">
      <Popover
        containInChat
        label="Model and reasoning"
        disabled={disabled}
        triggerClassName="model-selector-trigger"
        className="dx-model-popover"
        trigger={
          <>
            <span className="selected-model" title={model}>
              {model ? model.charAt(0).toUpperCase() + model.slice(1) : 'Select model'}
            </span>
            <span className="selected-reasoning">{kind === 'none' ? null : label}</span>
          </>
        }
      >
        <div className="model-reasoning-control" role="group" aria-label="Model and reasoning">
          <div className="model-reasoning-top">
            <svg
              className="reasoning-symbol"
              width="15"
              height="15"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="m11.5 2-8 9h6l-1 7 8-10h-6l1-6Z"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </svg>
            <div className="model-reasoning-labels">
              <span className="reasoning-value" title={caption}>
                {kind === 'none' ? null : label}
              </span>
              <SearchSelect
                label="Activity model"
                value={model}
                disabled={disabled}
                options={models.map((value) => ({
                  value,
                  label: value.charAt(0).toUpperCase() + value.slice(1),
                }))}
                onChange={changeModel}
                placeholder="Find a model…"
              />
            </div>
            <Button
              variant="layout"
              type="button"
              className="reasoning-reset"
              aria-label="Reset reasoning"
              title="Reset reasoning level"
              disabled={disabled || effective === preferred}
              onClick={() => changeReasoning('default')}
            >
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path
                  d="M16 7a6.5 6.5 0 1 0 .3 5M16 3v4h-4"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Button>
          </div>
          <div
            className="reasoning-slider"
            style={{ '--reasoning-progress': `${progress}%` } as CSSProperties}
          >
            <div className="reasoning-track" aria-hidden="true">
              {choices.map((value) => (
                <i key={value} />
              ))}
            </div>
            <RangeInput
              aria-label="Reasoning"
              aria-valuetext={unavailable ? caption : label}
              title={unavailable ? caption : `${label} reasoning`}
              min={0}
              max={Math.max(1, choices.length - 1)}
              step={1}
              value={index}
              disabled={disabled || unavailable}
              onChange={(event) => changeReasoning(choices[Number(event.target.value)])}
            />
          </div>
          <div className="reasoning-options" aria-hidden="true">
            {!unavailable &&
              choices.map((value) => (
                <span key={value}>
                  {value === 'default'
                    ? 'Default'
                    : value.charAt(0).toUpperCase() + value.slice(1)}
                </span>
              ))}
          </div>
          {unavailable && (
            <p className="reasoning-help" role="status">
              {caption}
              {kind === 'error' && (
                <Button
                  variant="layout"
                  type="button"
                  onClick={() => setRetry((value) => value + 1)}
                >
                  Retry
                </Button>
              )}
            </p>
          )}
        </div>
      </Popover>
    </div>
  );
}
