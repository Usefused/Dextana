import { Button, Field, FormSection, Icon, Notice, TextArea } from './ui';

export type AuthenticationDraft = { headers: string; body: string };
export function parseAuthenticationFields(draft: AuthenticationDraft) {
  try {
    return { headers: JSON.parse(draft.headers || '{}'), body: JSON.parse(draft.body || '{}') };
  } catch {
    throw new Error('Authentication headers and body fields must be valid JSON objects.');
  }
}

/** Shared private connection fields: saved values never return to the form. */
export function AuthenticationFields({ draft, change, saved, disabled, bodyHint, headerHint, clear }: {
  draft?: AuthenticationDraft;
  change: (draft: AuthenticationDraft) => void;
  saved?: boolean;
  disabled: boolean;
  bodyHint: string;
  headerHint?: string;
  clear: () => void;
}) {
  return <FormSection aria-label="Custom authentication fields">
    {saved && !draft && <Notice>Custom authentication is saved securely. Leave these fields untouched to keep it. Editing replaces the saved custom fields.</Notice>}
    <Field variant="card" label="Request headers (JSON)" hint={headerHint ?? 'Add multiple headers, such as X-API-Key and X-Tenant-ID. Include Authorization here if your service requires it.'}>
      {props => <TextArea {...props} rows={3} disabled={disabled} autoComplete="off" spellCheck={false} value={draft?.headers ?? ''} placeholder={'{"X-API-Key": "your key", "X-Tenant-ID": "your tenant"}'} onChange={event => change({ headers: event.target.value, body: draft?.body ?? '{}' })} />}
    </Field>
    <Field variant="card" label="Authentication body fields (JSON)" hint={bodyHint}>
      {props => <TextArea {...props} rows={3} disabled={disabled} autoComplete="off" spellCheck={false} value={draft?.body ?? ''} placeholder={'{"credentials": {"token": "your token"}}'} onChange={event => change({ headers: draft?.headers ?? '{}', body: event.target.value })} />}
    </Field>
    <div><Button type="button" variant="ghost" size="small" icon={<Icon name="trash" />} disabled={disabled} onClick={clear}>Clear custom authentication</Button></div>
  </FormSection>;
}
