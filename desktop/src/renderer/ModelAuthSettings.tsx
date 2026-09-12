import { useState } from 'react';
import type { Settings } from '../shared/types';
import { defaultModelAuth, modelAuth, type ModelAuth } from '../shared/model-auth';
import { Button, Field, Icon, Select } from './ui';
import { AuthenticationFields, parseAuthenticationFields } from './AuthenticationFields';

export type AuthDraft = { mode: 'bearer' | 'custom'; headers: string; body: string };
export function parsedAuth(draft?: AuthDraft): ModelAuth | undefined {
  if (!draft) return undefined;
  return modelAuth({ mode: draft.mode, ...parseAuthenticationFields(draft) });
}

export function ModelAuthSettings({
  settings,
  draft,
  change,
  disabled,
}: {
  settings: Settings;
  draft?: AuthDraft;
  change: (draft: AuthDraft) => void;
  disabled: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const mode = draft?.mode ?? settings.authMode ?? 'bearer';
  const update = (patch: Partial<AuthDraft>) =>
    change({ mode, headers: '{}', body: '{}', ...draft, ...patch });
  return (
    <>
      <Field
        variant="card"
        label="Authentication"
        hint={
          mode === 'bearer'
            ? 'Sends the API key as Authorization: Bearer. Use this for OpenRouter.'
            : 'Uses only your custom headers and body fields. The API key field is not sent.'
        }
      >
        {(props) => (
          <Select
            {...props}
            disabled={disabled}
            value={mode}
            onChange={(event) => {
              update({ mode: event.target.value as AuthDraft['mode'] });
              setExpanded(true);
            }}
          >
            <option value="bearer">Bearer API key</option>
            <option value="custom">Custom headers and body</option>
          </Select>
        )}
      </Field>
      <Button
        variant="ghost"
        size="small"
        icon={<Icon name="settings" />}
        disabled={disabled}
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? 'Hide authentication fields' : 'Configure headers and body'}
      </Button>
      {expanded && <AuthenticationFields
        draft={draft} change={fields => update(fields)} saved={settings.hasCustomAuth} disabled={disabled}
        headerHint="Add multiple headers, such as X-API-Key and X-Tenant-ID. Choose Custom authentication to set Authorization yourself."
        bodyHint="Merged into chat and embedding POST requests. Model discovery uses GET and sends headers only; enter model IDs manually if needed."
        clear={() => { const auth = defaultModelAuth(); change({ mode: auth.mode, headers: '{}', body: '{}' }); }}
      />}
    </>
  );
}
