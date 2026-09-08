import { useState } from 'react';
import type { FusedWorkspace as Workspace, MCPConnection } from '../shared/types';
export function FusedWorkspace({
  workspace,
  connections,
}: {
  workspace?: Workspace;
  connections: MCPConnection[];
}) {
  const [url, setUrl] = useState(workspace?.url ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="fused-workspace" aria-label="Fused workspace">
      <h3>{workspace ? 'Your Fused workspace' : 'Connect Fused'}</h3>
      <p>
        Sign in through your browser to find your MCP servers. Dext keeps this login separate from
        your terminal’s Fused account.
      </p>
      {workspace ? (
        <>
          <p role="status">Connected to {workspace.url}</p>
          <div className="mcp-actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void run(() => window.dextana.discoverFused())}
            >
              Refresh MCP servers
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void run(() => window.dextana.logoutFused())}
            >
              Disconnect workspace
            </button>
          </div>
          {!workspace.servers.length && (
            <p>No active MCP versions found. Refresh after deploying a server in Fused.</p>
          )}
          {workspace.servers.map((server) => (
            <Server
              key={server.id}
              server={server}
              connection={connections.find(
                (item) =>
                  item.fusedNative?.engine === workspace.url &&
                  item.fusedNative.server.id === server.id,
              )}
              disabled={busy}
            />
          ))}
        </>
      ) : (
        <>
          <label>
            Fused Engine URL
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              disabled={busy}
              placeholder="https://your-fused-engine"
            />
          </label>
          <button
            className="primary"
            disabled={busy || !url.trim()}
            onClick={() => void run(() => window.dextana.loginFused(url))}
          >
            {busy ? 'Waiting for browser sign-in…' : 'Sign in with Fused'}
          </button>
        </>
      )}
      {busy && (
        <button className="secondary" onClick={() => void window.dextana.cancelFusedLogin()}>
          Cancel Fused request
        </button>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <p className="secret-note">
        Login is encrypted on this device. Agent tokens are created after approval, stay in memory, and expire after 24 hours.
      </p>
    </section>
  );
}
function Server({
  server,
  connection,
  disabled,
}: {
  server: Workspace['servers'][number];
  connection?: MCPConnection;
  disabled: boolean;
}) {
  const [autoToken, setAutoToken] = useState(connection?.fusedNative?.autoToken ?? false);
  const [operations, setOperations] = useState(
    connection?.fusedNative?.operations.join(', ') ?? '',
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  return (
    <section
      className="mcp-connection fused-server"
      aria-label={`Fused server ${server.name} ${server.version}`}
    >
      <h3 title={server.name}>
        {server.name} <span className="optional">{server.version}</span>
      </h3>
      <p className="mcp-address" title={server.url}>{server.url}</p>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={autoToken}
          disabled={disabled || busy}
          onChange={(event) => setAutoToken(event.target.checked)}
        />
        <span title="Create a scoped 24-hour token after first-use approval">Automatically create agent tokens</span>
      </label>
      {autoToken && (
        <label>
          Allowed operation IDs
          <input
            value={operations}
            disabled={disabled || busy}
            placeholder="Exact IDs from Fused, separated by commas"
            onChange={(event) => setOperations(event.target.value)}
          />
        </label>
      )}
      <button
        className="secondary"
        disabled={disabled || busy || (autoToken && !operations.trim())}
        onClick={async () => {
          setBusy(true);
          setMessage('');
          try {
            await window.dextana.selectFusedServer(
              server.id,
              autoToken,
              operations
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean),
            );
            setMessage('MCP selection saved. The agent will ask for approval before creating a token.');
          } catch (failure) {
            setMessage((failure as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {connection ? 'Save access preferences' : 'Add MCP server'}
      </button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
