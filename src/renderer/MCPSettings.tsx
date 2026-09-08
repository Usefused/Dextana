import { useEffect, useState } from 'react';
import { FusedWorkspace } from './FusedWorkspace';
import { AccountConnection } from './FusedSettings';
import type { FusedWorkspace as Workspace, FusedAccount, MCPConnection, MCPConnectionInput, MCPToolPolicy } from '../shared/types';

const blank: MCPConnectionInput = {
  name: '',
  transport: 'http',
  url: '',
  command: '',
  args: [],
  enabled: true,
};
export function MCPSettings({ connections, account, saved, workspace }: { connections: MCPConnection[]; account?: FusedAccount; workspace?: Workspace; saved: () => Promise<void> }) {
  const [manual, setManual] = useState(false);
  const [preset, setPreset] = useState<'custom' | 'fused'>('custom');
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<MCPConnectionInput>(blank);
  const [args, setArgs] = useState('[]');
  const [environment, setEnvironment] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  function reset() {
    setPreset('custom');
    setEditorOpen(false);
    setDraft(blank);
    setArgs('[]');
    setEnvironment('');
    setToken('');
    setError('');
  }
  function edit(connection: MCPConnection) {
    setPreset('custom');
    setEditorOpen(true);
    setDraft({
      id: connection.id,
      name: connection.name,
      transport: connection.transport,
      url: connection.url,
      command: connection.command,
      args: connection.args,
      enabled: connection.enabled,
    });
    setArgs(JSON.stringify(connection.args));
    setEnvironment('');
    setToken('');
    setError('');
  }
  async function save() {
    setBusy(true);
    setError('');
    try {
      await window.dextana.saveMCP({
        ...draft,
        args: JSON.parse(args),
        ...(token ? { token } : {}),
        ...(environment.trim() ? { environment: JSON.parse(environment) } : {}),
      });
      reset();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-card mcp-settings">
      <h2>MCP connections</h2>
      <p>
        Connect your tools, test the connection, and choose which tools Dextana may use. New and
        changed tools start disabled.
      </p>
      {account && <details><summary>Previously connected Fused account</summary><AccountConnection key={account.connectedAt} account={account} saved={saved} /></details>}
      {connections.map((connection) => (
        <Connection
          key={connection.id}
          connection={connection}
          edit={() => edit(connection)}
          removed={() => {
            if (draft.id === connection.id) reset();
          }}
        />
      ))}
      {!connections.length && <p className="muted">No MCP connections added yet.</p>}
      {!!connections.length && !editorOpen && <button className="secondary mcp-add" onClick={() => setEditorOpen(true)}>Add another connection</button>}
      {(editorOpen || !connections.length) && <div className="mcp-editor">

        <h3>{draft.id ? 'Edit connection' : 'Add a connection'}</h3>
        {!draft.id && <div className="mcp-presets" role="group" aria-label="MCP setup options">
          <button type="button" aria-pressed={preset === 'fused'} onClick={() => { setPreset('fused'); setEditorOpen(true); setDraft({ ...blank, name: 'Fused' }); setToken(''); }}>Fused</button>
          <button type="button" aria-pressed={preset === 'custom'} onClick={() => { setPreset('custom'); setDraft(blank); setToken(''); }}>Custom MCP</button>
        </div>}
        {preset === 'fused' && <FusedWorkspace key={workspace?.url ?? 'new'} workspace={workspace} connections={connections} />}
        {preset === 'fused' && <button className="secondary" onClick={() => setManual(!manual)}>{manual ? 'Hide manual setup' : 'Connect with an existing execution token'}</button>}
        {(preset !== 'fused' || manual) && <>
        <label>
          MCP connection name
          <input
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </label>
        {preset !== 'fused' && <label>
          MCP transport
          <select
            value={draft.transport}
            onChange={(event) => {
              setDraft({ ...draft, transport: event.target.value as 'http' | 'stdio' });
              setToken('');
              setEnvironment('');
            }}
          >
            <option value="http">Remote · Streamable HTTP</option>
            <option value="stdio">Local · stdio</option>
          </select>
        </label>}
        {draft.transport === 'http' ? (
          <>
            <label>
              MCP server URL
              <input
                placeholder={preset === 'fused' ? "https://your-engine/mcp/your-version-id/mcp" : "https://your-server/mcp"}
                value={draft.url}
                onChange={(event) => setDraft({ ...draft, url: event.target.value })}
              />
            </label>
            <label>
              MCP bearer token
              <input
                type="password"
                autoComplete="off"
                value={token}
                placeholder={draft.id ? 'Leave blank to keep saved credentials' : preset === 'fused' ? 'Paste your Fused MCP execution token' : 'Optional'}
                onChange={(event) => setToken(event.target.value)}
              />
            </label>
          </>
        ) : (
          <>
            <label>
              MCP command
              <input
                placeholder="/path/to/executable"
                value={draft.command}
                onChange={(event) => setDraft({ ...draft, command: event.target.value })}
              />
            </label>
            <label>
              MCP arguments (JSON array)
              <textarea rows={2} value={args} onChange={(event) => setArgs(event.target.value)} />
            </label>
            <label>
              MCP environment (JSON object)
              <textarea
                rows={2}
                value={environment}
                placeholder={
                  draft.id ? 'Leave blank to keep saved environment' : '{"API_KEY":"..."}'
                }
                onChange={(event) => setEnvironment(event.target.value)}
              />
            </label>
            <p className="muted">
              Testing starts this local command with your account’s permissions. Environment values
              are stored encrypted.
            </p>
          </>
        )}
        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
          />
          Enable MCP connection
        </label>
        <button
          className="primary"
          disabled={busy || !draft.name.trim()}
          onClick={() => {
            void save();
          }}
        >
          {draft.id ? 'Save MCP connection' : 'Add MCP connection'}
        </button>{' '}
        {!!connections.length && (
          <button className="secondary" onClick={reset} disabled={busy}>
            Cancel editing
          </button>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </>}
      </div>}

    </div>
  );
}

function Connection({
  connection,
  edit,
  removed,
}: {
  connection: MCPConnection;
  edit: () => void;
  removed: () => void;
}) {
  const [policies, setPolicies] = useState<Record<string, MCPToolPolicy>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  useEffect(() => {
    setPolicies(Object.fromEntries(connection.tools.map((tool) => [tool.name, tool.policy])));
  }, [connection.revision]);
  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await action();
      setStatus(message);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mcp-connection" aria-label={`MCP connection ${connection.name}`}>
      <div className="mcp-connection-heading">
        <h3>{connection.name}</h3>
        <label className="mcp-switch-label">
          <span>{connection.enabled ? 'Active' : 'Inactive'}</span>
          <input type="checkbox" role="switch" aria-label={`Activate ${connection.name}`} checked={connection.enabled} disabled={busy} onChange={(event) => {
            const enabled = event.target.checked;
            void run(() => window.dextana.saveMCP({
              id: connection.id, name: connection.name, transport: connection.transport,
              url: connection.url, command: connection.command, args: connection.args, enabled,
            }), enabled ? 'Connection activated' : 'Connection deactivated');
          }} />
        </label>
      </div>
      <p className="mcp-address">
        {connection.transport === 'http'
          ? connection.url
          : [connection.command, ...connection.args].join(' ')}
      </p>
      <div className="mcp-actions">
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            void run(() => window.dextana.testMCP(connection.id), 'Connection tested');
          }}
        >
          {busy ? 'Working…' : 'Test connection'}
        </button>
        <button className="secondary" disabled={busy} onClick={edit}>
          Edit connection
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            void run(async () => {
              await window.dextana.removeMCP(connection.id);
              removed();
            }, 'Removed');
          }}
        >
          Remove connection
        </button>
      </div>
      {connection.fusedNative && <p className="muted">Fused · Version {connection.fusedNative.server.version} · {connection.fusedNative.autoToken ? 'Approval required at first use' : 'Automatic tokens off'}</p>}
      {connection.testedAt && (
        <p className={connection.enabled ? 'success' : 'muted'}>{connection.enabled ? 'Connected' : 'Inactive'} · {connection.tools.length} tools</p>
      )}
      {!connection.enabled && <p className="muted">This connection is unavailable to the agent. Your tool preferences are kept for when you reactivate it.</p>}
      {!connection.tools.length && <p className="muted">Test the connection to discover its tools.</p>}
      {connection.tools.map((tool) => (
        <div className="mcp-tool" key={tool.name}>
          <div className="mcp-tool-heading">
            <strong>{tool.name}</strong>
            <input className="mcp-tool-switch" type="checkbox" role="switch" aria-label={`Enable tool ${tool.name}`} checked={(policies[tool.name] ?? tool.policy) !== 'disabled'} disabled={busy} onChange={(event) => {
              const updated = { ...policies, [tool.name]: event.target.checked ? 'ask' as const : 'disabled' as const };
              void run(() => window.dextana.setMCPTools(connection.id, updated), 'Tool permissions saved');
            }} />
            <select
              aria-label={`Policy for ${tool.name}`}
              value={policies[tool.name] ?? tool.policy}
              disabled={busy}
              onChange={(event) =>
                setPolicies({ ...policies, [tool.name]: event.target.value as MCPToolPolicy })
              }
            >
              <option value="disabled">Disabled</option>
              <option value="ask">Ask every time</option>
              <option value="auto">Allow automatically</option>
            </select>
          </div>
          <p>{tool.description || 'No description provided.'}</p>
          <details>
            <summary>Schema for {tool.name}</summary>
            <pre>
              {JSON.stringify(
                {
                  inputSchema: tool.inputSchema,
                  ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
                },
                null,
                2,
              )}
            </pre>
          </details>
        </div>
      ))}
      {!!connection.tools.length && (
        <>
          <p className="muted">
            “Ask every time” uses Harnest approvals and overrides chat-wide auto-allow. Tool
            permissions apply across chats.
          </p>
          <button
            className="primary"
            disabled={busy}
            onClick={() => {
              void run(
                () => window.dextana.setMCPTools(connection.id, policies),
                'Tool permissions saved',
              );
            }}
          >
            Save tool permissions
          </button>
        </>
      )}
      {status && (
        <p role="status" className="success">
          {status}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
