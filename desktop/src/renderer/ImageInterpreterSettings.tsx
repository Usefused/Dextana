import { useState } from 'react';
import type { Settings } from '../shared/types';
import { Field, Select, TextInput } from './ui';

export function ImageInterpreterSettings({
  settings,
  models,
  disabled,
  change,
}: {
  settings: Settings;
  models?: string[];
  disabled: boolean;
  change: (settings: Settings) => void;
}) {
  const [manual, setManual] = useState(false);
  const selected = settings.imageInterpreterModel;
  const options = [...new Set([...(models ?? []), ...(selected ? [selected] : [])])];
  const select = (value: string) =>
    change({ ...settings, imageInterpreterModel: value || undefined });
  return (
    <>
      <Field
        label="Image interpreter"
        hint="Optional. Uses this connection to describe images and screenshots for your chat model. Image interpretation adds a model call; the chat model receives the description."
      >
        {(props) => (
          <Select
            {...props}
            disabled={disabled}
            value={manual ? 'manual' : selected ? `model:${selected}` : ''}
            onChange={(event) => {
              const value = event.target.value;
              setManual(value === 'manual');
              if (value !== 'manual') select(value ? value.slice('model:'.length) : '');
            }}
          >
            <option value="">Use the selected chat model</option>
            {options.map((id) => (
              <option key={id} value={`model:${id}`}>
                {id}
              </option>
            ))}
            <option value="manual">Enter a model ID manually…</option>
          </Select>
        )}
      </Field>
      {models === undefined && (
        <p className="settings-caption">
          {settings.provider === 'openai' ? 'Fetch models' : 'Connect to Ollama'} to discover
          image-capable models.
        </p>
      )}
      {models?.length === 0 && (
        <p className="settings-caption">
          This connection did not report any image-capable models. Enter an ID manually if your
          provider supports image input.
        </p>
      )}
      {manual && (
        <Field label="Image interpreter model ID">
          {(props) => (
            <TextInput
              {...props}
              disabled={disabled}
              value={selected ?? ''}
              placeholder="Enter an image-capable model ID"
              onChange={(event) => select(event.target.value)}
            />
          )}
        </Field>
      )}
    </>
  );
}
