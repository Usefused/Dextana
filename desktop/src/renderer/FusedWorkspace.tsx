import { Card, CheckboxField, Field, Button, TextInput, Icon } from './ui';
import { useEffect, useState } from 'react';
import { FusedCLISetup } from './FusedCLISetup';
import type { FusedWorkspace as Workspace, MCPConnection } from '../shared/types';
export function FusedWorkspace({
  workspace,
  connections,
}: {
  workspace?: Workspace;
  connections: MCPConnection[];
}) {
  const [cliReady, setCLIReady] = useState(false);
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
      <FusedCLISetup ready={setCLIReady} />
      <h3>{workspace ? 'Your Fused workspace' : 'Connect Fused'}</h3>
      <p>
        Sign in through your browser to find your MCP servers. Dext keeps this login separate from
        your terminal’s Fused account.
      </p>
      {workspace ? (
        <>
          <p role="status">Connected to {workspace.url}</p>
          <div className="mcp-actions">
            <Button
              icon={<Icon name="refresh" />}
              variant="secondary"
              className="secondary"
              disabled={busy}
              onClick={() => void run(() => window.dextana.discoverFused())}
            >
              Refresh MCP servers
            </Button>
            <Button
              icon={<Icon name="trash" />}
              variant="secondary"
              className="secondary"
              disabled={busy}
              onClick={() => void run(() => window.dextana.logoutFused())}
            >
              Disconnect workspace
            </Button>
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
          <Field variant="card" label="Fused Engine URL">
            {(props) => (
              <TextInput
                {...props}
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                disabled={busy}
                placeholder="https://your-fused-engine"
              />
            )}
          </Field>
          <Button
            icon={<Icon name="plug" />}
            variant="primary"
            className="primary"
            disabled={busy || !cliReady || !url.trim()}
            onClick={() => void run(() => window.dextana.loginFused(url))}
          >
            {busy ? 'Waiting for browser sign-in…' : 'Sign in with Fused'}
          </Button>
        </>
      )}
      {busy && (
        <Button
          icon={<Icon name="close" />}
          variant="secondary"
          className="secondary"
          onClick={() => void window.dextana.cancelFusedLogin()}
        >
          Cancel Fused request
        </Button>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <p className="secret-note">
        Login is encrypted on this device. Agent tokens are created after approval, stay in memory,
        and expire after 24 hours.
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
  const [autoToken, setAutoToken] = useState(connection?.fusedNative?.autoToken ?? true);
  const [operations, setOperations] = useState(connection?.fusedNative?.operations ?? []);
  const [restricted, setRestricted] = useState(operations.length > 0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  return (
    <Card className="fused-server" aria-label={`Fused server ${server.name} ${server.version}`}>
      <div className="fused-server-identity">
        <h3 title={server.name}>
          {server.name} <span className="optional">{server.version}</span>
        </h3>
        <p className="mcp-address" title={server.url}>
          {server.url}
        </p>
      </div>
      <CheckboxField
        label="Automatically create agent tokens"
        description="Create a scoped 24-hour token after first-use approval."
        checked={autoToken}
        disabled={disabled || busy}
        onChange={(event) => setAutoToken(event.target.checked)}
      />
      {autoToken && (
        <OperationPicker
          serverId={server.id}
          value={operations}
          restricted={restricted}
          disabled={disabled || busy}
          restrict={setRestricted}
          change={setOperations}
        />
      )}
      <Button
        icon={<Icon name={connection ? 'check' : 'plus'} />}
        variant="secondary"
        size="small"
        className="fused-server-action"
        disabled={disabled || busy || (autoToken && restricted && !operations.length)}
        onClick={async () => {
          setBusy(true);
          setMessage('');
          try {
            await window.dextana.selectFusedServer(
              server.id,
              autoToken,
              restricted ? operations : [],
            );
            setMessage(
              'Connected and tools discovered. Documentation search runs automatically and execution asks every time when available. You can change every policy in Manage tools.',
            );
          } catch (failure) {
            setMessage((failure as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {connection ? 'Save access preferences' : 'Add MCP server'}
      </Button>
      {message && <p role="status">{message}</p>}
    </Card>
  );
}

function OperationPicker({
  serverId,
  value,
  restricted,
  disabled,
  restrict,
  change,
}: {
  serverId: string;
  value: string[];
  restricted: boolean;
  disabled: boolean;
  restrict: (value: boolean) => void;
  change: (value: string[]) => void;
}) {
  const [catalog, setCatalog] = useState<string[]>();
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!restricted) return;
    let live = true;
    setError('');
    setCatalog(undefined);
    void window.dextana
      .fusedOperations(serverId)
      .then((ids) => {
        if (live) setCatalog(ids);
      })
      .catch(() => {
        if (live) setError('Could not load operations. Refresh the server list or try again.');
      });
    return () => {
      live = false;
    };
  }, [serverId, restricted, retry]);
  return (
    <div className="fused-operation-picker">
      <CheckboxField
        label="All operations"
        description="Turn off to choose specific operations for agent tokens."
        checked={!restricted}
        disabled={disabled}
        onChange={(event) => restrict(!event.target.checked)}
      />
      {restricted && (
        <>
          <Field label="Find operations">
            {(props) => (
              <TextInput
                {...props}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search operation names…"
              />
            )}
          </Field>
          {!catalog && !error && <p role="status">Loading server operations…</p>}
          {error && (
            <>
              <p role="alert">{error}</p>
              <Button size="small" disabled={disabled} onClick={() => setRetry((n) => n + 1)}>
                Retry operations
              </Button>
            </>
          )}
          {catalog && (
            <div className="fused-operation-list" role="group" aria-label="Allowed operations">
              {[...new Set([...catalog, ...value])]
                .filter((id) => id.toLowerCase().includes(query.toLowerCase()))
                .map((id) => (
                  <CheckboxField
                    key={id}
                    label={id}
                    description={
                      catalog.includes(id)
                        ? undefined
                        : 'Previously selected; no longer listed by this server.'
                    }
                    checked={value.includes(id)}
                    disabled={disabled}
                    onChange={(event) =>
                      change(
                        event.target.checked ? [...value, id] : value.filter((item) => item !== id),
                      )
                    }
                  />
                ))}
              {!catalog.length && <p>No operations found in this server.</p>}
            </div>
          )}
          <p>{value.length} selected. Select at least one operation to save restricted access.</p>
        </>
      )}
    </div>
  );
}
