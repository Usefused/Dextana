import { Button, Field, Icon, Modal, Switch, TextInput } from './ui';
import { useId, useState } from 'react';
import { FusedWorkspace } from './FusedWorkspace';
import { AccountConnection } from './FusedSettings';
import { MCPConnect } from './MCPConnect';
import { MCPTools } from './MCPTools';
import type { FusedWorkspace as Workspace, FusedAccount, MCPConnection } from '../shared/types';
import './mcp.css';

type Setup = { url: string; local?: boolean; connection?: MCPConnection; defaultName?: string };
export function MCPSettings({
  connections,
  account,
  saved,
  workspace,
}: {
  connections: MCPConnection[];
  account?: FusedAccount;
  workspace?: Workspace;
  saved: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [preset, setPreset] = useState<'custom' | 'fused'>('custom');
  const [manual, setManual] = useState(false);
  const [url, setUrl] = useState('');
  const [setup, setSetup] = useState<Setup>();
  const [toolsId, setToolsId] = useState<string>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ id: string; text: string }>();
  const selected = connections.find((connection) => connection.id === toolsId);
  function begin() {
    try {
      const address = new URL(url.trim());
      if (
        !['https:', 'http:'].includes(address.protocol) ||
        address.username ||
        address.password ||
        address.search ||
        address.hash ||
        (address.protocol === 'http:' &&
          !['localhost', '127.0.0.1', '[::1]'].includes(address.hostname))
      )
        throw new Error();
      setError('');
      setAdding(false);
      setSetup({ url: address.href, defaultName: preset === 'fused' ? 'Fused' : undefined });
    } catch {
      setError('Enter an HTTPS MCP address, or HTTP for a server on this computer.');
    }
  }
  const filtered = connections.filter((connection) =>
    `${connection.name} ${connection.transport === 'stdio' ? 'local desktop' : 'web'} ${connection.url}`
      .toLowerCase()
      .includes(query.toLowerCase().trim()),
  );
  return (
    <div className="mcp-hub">
      <div className="connectors-toolbar">
        <TextInput
          aria-label="Search connectors"
          placeholder="Search connectors"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Button
          icon={<Icon name="plus" />}
          variant="primary"
          aria-label="Add connector"
          onClick={() => {
            setError('');
            setAdding(true);
          }}
        >
          Add
        </Button>
      </div>
      <div className="connectors-list-heading" aria-hidden="true">
        <span>Connector</span>
        <span>Type</span>
        <span>Status</span>
        <span />
      </div>
      {!connections.length && (
        <p className="mcp-empty-note">
          No connectors yet. Add one to give Dextana access to your tools.
        </p>
      )}
      {!!connections.length && !filtered.length && (
        <p className="mcp-empty-note">No connectors match your search.</p>
      )}
      <div className="mcp-connection-grid">
        {filtered.map((connection) => (
          <Connection
            key={connection.id}
            connection={connection}
            notice={notice?.id === connection.id ? notice.text : undefined}
            saved={saved}
            clearNotice={() => setNotice(undefined)}
            edit={() =>
              setSetup({ url: connection.url, local: connection.transport === 'stdio', connection })
            }
            tools={() => setToolsId(connection.id)}
          />
        ))}
      </div>
      {adding && (
        <Modal
          className="connector-add-modal"
          title="Add connector"
          description="Connect the services Dext needs to get work done."
          closeLabel="Close add connector"
          close={() => setAdding(false)}
        >
          <div
            className="connector-setup-options"
            role="group"
            aria-label="MCP setup options"
            data-selected={preset}
          >
            <Button
              variant="layout"
              type="button"
              aria-pressed={preset === 'custom'}
              onClick={() => {
                setPreset('custom');
                setError('');
              }}
            >
              Custom MCP
            </Button>
            <Button
              variant="layout"
              type="button"
              aria-pressed={preset === 'fused'}
              onClick={() => {
                setPreset('fused');
                setError('');
              }}
            >
              Fused
            </Button>
          </div>
          <div className="connector-setup-content">
          {preset === 'fused' && (
            <>
              <FusedWorkspace
                key={workspace?.url ?? 'new'}
                workspace={workspace}
                connections={connections}
              />
              <Button
                icon={<Icon name="gear" />}
                variant="ghost"
                onClick={() => setManual(!manual)}
              >
                {manual ? 'Hide manual setup' : 'Connect with an existing execution token'}
              </Button>
            </>
          )}
          {(preset === 'custom' || manual) && (
            <section className="connector-address-setup">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  begin();
                }}
              >
                <Field
                  variant="card"
                  label="MCP server URL"
                  error={error}
                  hint="Use the MCP address provided by your service."
                >
                  {(field) => (
                    <div className="connector-address-row">
                      <TextInput
                        {...field}
                        type="url"
                        placeholder="https://your-server.com/mcp"
                        value={url}
                        onChange={(event) => {
                          setUrl(event.target.value);
                          setError('');
                        }}
                        required
                      />
                      <Button
                        variant="primary"
                        type="submit"
                        disabled={!url.trim()}
                        endIcon={<Icon name="arrow" />}
                      >
                        Continue
                      </Button>
                    </div>
                  )}
                </Field>
              </form>
              {preset === 'custom' && (
                <div className="connector-local-option">
                  <div>
                    <span>Running on this computer?</span>
                    <p>Connect a tool with a local command.</p>
                  </div>
                  <Button
                    variant="primary"
                    endIcon={<Icon name="arrow" />}
                    onClick={() => {
                      setAdding(false);
                      setSetup({ url: '', local: true });
                    }}
                  >
                    Connect a local tool
                  </Button>
                </div>
              )}
            </section>
          )}
          </div>
        </Modal>
      )}
      {account && (
        <details>
          <summary>Previously connected Fused account</summary>
          <AccountConnection key={account.connectedAt} account={account} saved={saved} />
        </details>
      )}
      {setup && (
        <MCPConnect
          {...setup}
          close={() => setSetup(undefined)}
          saved={saved}
          connected={(id) => {
            setSetup(undefined);
            setUrl('');
            setToolsId(id);
          }}
        />
      )}
      {selected && (
        <MCPTools
          key={`${selected.id}:${selected.revision}`}
          connection={selected}
          close={() => setToolsId(undefined)}
          saved={async () => {
            await saved();
            setNotice({ id: selected.id, text: 'Tool permissions saved' });
          }}
        />
      )}
    </div>
  );
}

function Connection({
  connection,
  edit,
  tools,
  saved,
  notice,
  clearNotice,
}: {
  connection: MCPConnection;
  edit: () => void;
  tools: () => void;
  saved: () => Promise<void>;
  notice?: string;
  clearNotice: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const enabledTools = connection.tools.filter((tool) => tool.policy !== 'disabled').length;
  const detailId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError('');
    setStatus('');
    clearNotice();
    try {
      await action();
      await saved();
      setStatus(message);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mcp-connection-card" aria-label={`MCP connection ${connection.name}`}>
      <Button
        variant="layout"
        className="connector-summary"
        aria-label={`${connection.name} details`}
        aria-expanded={expanded}
        aria-controls={detailId}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="connector-identity">
          <span className="mcp-server-icon" aria-hidden="true">
            {connection.name.slice(0, 1).toUpperCase()}
          </span>
          <span>{connection.name}</span>
        </span>
        <span className="connector-type">
          {connection.transport === 'stdio' ? 'Desktop' : 'Web'}
          {connection.fusedNative && <small>Fused</small>}
        </span>
        <span className={error ? 'connector-state connector-state-error' : 'connector-state'}>
          {error
            ? 'Needs attention'
            : !connection.enabled
              ? 'Inactive'
              : connection.testedAt
                ? 'Connected'
                : 'Not tested'}
        </span>
        <svg
          className="connector-chevron"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="m6 3 5 5-5 5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Button>
      <div className="connector-detail" id={detailId} hidden={!expanded}>
        <div className="mcp-card-heading">
          <div className="connector-address">
            <p>{connection.transport === 'http' ? connection.url : connection.command}</p>
          </div>
          <Switch
            aria-label={`Activate ${connection.name}`}
            checked={connection.enabled}
            disabled={busy}
            onChange={(event) => {
              const enabled = event.target.checked;
              void run(
                () =>
                  window.dextana.saveMCP({
                    id: connection.id,
                    name: connection.name,
                    transport: connection.transport,
                    url: connection.url,
                    command: connection.command,
                    args: connection.args,
                    enabled,
                  }),
                enabled ? 'Connection activated' : 'Connection deactivated',
              );
            }}
          />
        </div>
        <div className="mcp-card-meta">
          <span className={connection.enabled ? 'mcp-connected' : ''}>
            {connection.testedAt
              ? `${connection.enabled ? 'Connected' : 'Inactive'} · ${enabledTools}/${connection.tools.length} tools enabled`
              : 'Ready to connect'}
          </span>
          <span>
            {connection.fusedNative
              ? `Fused · ${connection.fusedNative.server.version}`
              : connection.transport === 'stdio'
                ? 'Local tool'
                : connection.auth?.type === 'custom'
                  ? 'Custom authentication'
                  : connection.auth?.type === 'header'
                    ? connection.auth.name
                    : connection.auth?.type === 'body'
                      ? 'Body authentication'
                      : connection.auth?.type === 'none'
                        ? 'No authentication'
                        : 'Bearer token'}
          </span>
        </div>
        <div className="mcp-card-actions">
          <Button
            icon={<Icon name="gear" />}
            variant="secondary"
            disabled={busy || !connection.tools.length}
            onClick={tools}
          >
            Manage tools
          </Button>
          <Button
            icon={<Icon name="refresh" />}
            variant="secondary"
            disabled={busy}
            title={
              connection.fusedNative
                ? 'Create a temporary scoped token, discover tools, then revoke the token.'
                : undefined
            }
            onClick={() =>
              void run(async () => {
                await window.dextana.testMCP(connection.id);
                tools();
              }, 'Connection tested')
            }
          >
            {busy ? 'Connecting…' : 'Test connection'}
          </Button>
          {!connection.fusedNative && (
            <Button icon={<Icon name="edit" />} variant="secondary" disabled={busy} onClick={edit}>
              Edit connection
            </Button>
          )}
          <Button
            icon={<Icon name="trash" />}
            variant="danger"
            disabled={busy}
            onClick={() => void run(() => window.dextana.removeMCP(connection.id), 'Removed')}
          >
            Remove connection
          </Button>
        </div>
        {(notice || status) && (
          <p role="status" className="mcp-card-status">
            {notice || status}
          </p>
        )}
        {error && (
          <p role="alert" className="mcp-modal-error">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
