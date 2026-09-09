import { useState } from 'react';
import type { Settings } from '../shared/types';
import { Field, Select, TextInput, Notice } from './ui';

export function MemorySettings({ settings, models, disabled, change }: { settings: Settings; models?: string[]; disabled: boolean; change: (settings: Settings) => void }) {
  const [manual, setManual] = useState(false);
  const options = [...new Set([...(models ?? []), ...(settings.embeddingModel ? [settings.embeddingModel] : [])])];
  const select = (embeddingModel: string) => change({ ...settings, embeddingModel, embeddingDimensions: undefined, memoryError: undefined });
  const status = !settings.embeddingModel
    ? 'Long-term memory is disabled. Configure an embedding model to enable it.'
    : settings.memoryError ?? (settings.embeddingDimensions
      ? 'Long-term memory is enabled. Relevant details can be remembered across chats.'
      : 'Save settings to test this embedding model and enable long-term memory.');
  return <>
    <Field label="Embedding model" hint="Optional. Uses this connection to find relevant memories. The selected chat model creates summaries and memories together. Model calls may incur charges.">
      {props => <Select {...props} disabled={disabled} value={manual ? 'manual' : settings.embeddingModel ? `model:${settings.embeddingModel}` : ''} onChange={event => {
        const value = event.target.value;
        setManual(value === 'manual');
        if (value !== 'manual') select(value ? value.slice('model:'.length) : '');
      }}>
        <option value="">Disabled</option>
        {options.map(id => <option key={id} value={`model:${id}`}>{id}</option>)}
        <option value="manual">Enter a model ID manually…</option>
      </Select>}
    </Field>
    {models === undefined && <p className="settings-caption">{settings.provider === 'openai' ? 'Fetch models' : 'Connect to Ollama'} to load available embedding models.</p>}
    {models?.length === 0 && <p className="settings-caption">This connection did not list any embedding models. You can enter an ID manually if it supports embeddings.</p>}
    {manual && <Field label="Embedding model ID">
      {props => <TextInput {...props} disabled={disabled} value={settings.embeddingModel ?? ''} placeholder="Enter an embedding model ID" onChange={event => select(event.target.value)} />}
    </Field>}
    <Notice tone={settings.memoryError ? 'danger' : 'neutral'}>{status}</Notice>
  </>;
}
