import { Button, Field, FormSection, Select, TextArea, TextInput, Icon } from './ui';
import { useRef, useState } from 'react';
import type { MCPAuth, MCPConnection } from '../shared/types';
import { MCPDialog } from './MCPDialog';

export function MCPConnect({ url, local, connection, defaultName, connected, close, saved }: { url: string; local?: boolean; connection?: MCPConnection; defaultName?: string; connected: (id: string) => void; close: () => void; saved: () => Promise<void> }) {
  const [name, setName] = useState(connection?.name ?? defaultName ?? (local ? '' : new URL(url).hostname));
  const [address, setAddress] = useState(connection?.url ?? url);
  const [method, setMethod] = useState<MCPAuth['type']>(connection?.auth?.type ?? (connection ? connection.secretId ? 'bearer' : 'none' : 'bearer'));
  const [header, setHeader] = useState(connection?.auth?.type === 'header' ? connection.auth.name : 'X-API-KEY');
  const [field, setField] = useState(connection?.auth?.type === 'body' ? connection.auth.name : 'api_key');
  const [token, setToken] = useState('');
  const [visible, setVisible] = useState(false);
  const [command, setCommand] = useState(connection?.command ?? '');
  const [args, setArgs] = useState(JSON.stringify(connection?.args ?? []));
  const [environment, setEnvironment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pendingId = useRef(connection?.id);
  async function dismiss() {
    if (busy) return;
    setBusy(true);
    try {
      // A cancelled setup leaves no half-created connection or credential behind.
      if (!connection && pendingId.current) { await window.dextana.removeMCP(pendingId.current); await saved(); }
      close();
    } catch { setError('Could not cancel setup. Please try again.'); setBusy(false); }
  }
  async function connect() {
    setBusy(true); setError('');
    try {
      const auth: MCPAuth = method === 'header' ? { type: method, name: header } : method === 'body' ? { type: method, name: field } : { type: method };
      const id = await window.dextana.saveMCP({
        id: pendingId.current, name, transport: local ? 'stdio' : 'http', url: address,
        command, args: local ? JSON.parse(args) : [], enabled: connection?.enabled ?? true,
        ...(!local ? { auth, ...(method !== 'none' && token ? { token } : {}) } : {}),
        ...(local && environment.trim() ? { environment: JSON.parse(environment) } : {}),
      });
      pendingId.current = id;
      await window.dextana.testMCP(id);
      await saved();
      setToken(''); setEnvironment('');
      connected(id);
    } catch (failure) {
      setError(failure instanceof SyntaxError ? 'Check the arguments and environment format.' : (failure as Error).message);
    } finally { setBusy(false); }
  }
  return <MCPDialog title={local ? 'Connect local MCP' : 'Connect MCP'} busy={busy} close={() => void dismiss()}>
    <p className="mcp-modal-intro">{local ? 'Connect a tool running on your computer.' : 'One connection. More ways to get work done.'}</p>
    {!local && <div className="mcp-endpoint"><span aria-hidden="true">↗</span><span>{address}</span><span className="mcp-transport-pill">MCP</span></div>}
    <form onSubmit={event => { event.preventDefault(); void connect(); }}>
      <FormSection className="mcp-modal-fields">
        <Field variant="card" label="MCP connection name">{props => <TextInput {...props} autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="Name this connection" disabled={busy} required maxLength={100}/>}</Field>
        {connection && !local && <Field variant="card" label="MCP server URL">{props => <TextInput {...props} type="url" value={address} onChange={event => setAddress(event.target.value)} disabled={busy} required/>}</Field>}
        {local ? <>
          <Field variant="card" label="MCP command">{props => <TextInput {...props} value={command} onChange={event => setCommand(event.target.value)} placeholder="/path/to/executable" disabled={busy} required/>}</Field>
          <Field variant="card" label="MCP arguments (JSON array)">{props => <TextArea {...props} rows={2} value={args} onChange={event => setArgs(event.target.value)} disabled={busy}/>}</Field>
          <Field variant="card" label="MCP environment (JSON object)">{props => <TextArea {...props} rows={2} value={environment} onChange={event => setEnvironment(event.target.value)} placeholder={connection?.secretId ? 'Leave blank to keep saved environment' : '{"API_KEY":"..."}'} disabled={busy}/>}</Field>
          <p className="mcp-field-help">Connecting starts this command with your account’s permissions. Environment values are stored encrypted.</p>
        </> : <>
          <Field variant="card" label="Authentication method">{props => <Select {...props} value={method} disabled={busy} onChange={event => setMethod(event.target.value as MCPAuth['type'])}>
            <option value="bearer">Bearer token</option><option value="header">Custom header · X-API-KEY</option><option value="body">Request body</option><option value="none">No authentication</option>
          </Select>}</Field>
          {method === 'header' && <Field variant="card" label="Header name">{props => <TextInput {...props} value={header} onChange={event => setHeader(event.target.value)} placeholder="X-API-KEY" disabled={busy} required/>}</Field>}
          {method === 'body' && <Field variant="card" label="Body field name">{props => <TextInput {...props} value={field} onChange={event => setField(event.target.value)} placeholder="api_key" disabled={busy} required/>}</Field>}
          {method !== 'none' && <Field variant="card" label="Auth token">{props => <div className="mcp-secret-field"><TextInput {...props} type={visible ? 'text' : 'password'} value={token} autoComplete="off" spellCheck={false} onChange={event => setToken(event.target.value)} placeholder={connection?.secretId || pendingId.current ? 'Leave blank to keep saved token' : 'Paste your token'} disabled={busy}/><Button variant="secondary" size="small" type="button" aria-label={visible ? 'Hide token' : 'Show token'} onClick={() => setVisible(!visible)}>{visible ? 'Hide' : 'Show'}</Button></div>}</Field>}
          <div className="mcp-auth-note"><span aria-hidden="true">⌁</span><p>{method === 'bearer' ? 'Sent in the Authorization header as a Bearer token.' : method === 'header' ? `Sent as the value of your ${header || 'custom'} header.` : method === 'body' ? 'Added as a top-level field in each JSON request, for gateways that require body authentication.' : 'Connect without sending credentials.'}</p></div>
        </>}
        {error && <p className="mcp-modal-error" role="alert">{error}</p>}
      </FormSection>
      <div className="mcp-modal-footer"><span>{local || method !== 'none' ? 'Credentials are stored encrypted on this device.' : 'You’ll choose which tools to enable next.'}</span><Button icon={<Icon name="plug" />} variant="primary" type="submit" disabled={busy || !name.trim()}>{busy ? 'Connecting…' : 'Connect'}<span aria-hidden="true">↗</span></Button></div>
    </form>
  </MCPDialog>;
}
