import { Button, CheckboxCard, Icon, Select, TextInput } from './ui';
import { useState } from 'react';
import type { MCPConnection, MCPToolPolicy } from '../shared/types';
import { MCPDialog } from './MCPDialog';

export function MCPTools({
  connection,
  close,
  saved,
}: {
  connection: MCPConnection;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [policies, setPolicies] = useState(
    Object.fromEntries(connection.tools.map((tool) => [tool.name, tool.policy])),
  );
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selected = connection.tools.filter((tool) => policies[tool.name] !== 'disabled').length;
  const filtered = connection.tools.filter((tool) =>
    `${tool.name} ${tool.description}`.toLowerCase().includes(search.toLowerCase()),
  );
  async function save() {
    setBusy(true);
    setError('');
    try {
      await window.dextana.setMCPTools(connection.id, policies);
      await saved();
      close();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <MCPDialog title="Choose tools" wide busy={busy} close={close}>
      <p className="mcp-modal-intro">
        <strong>{connection.name}</strong> is connected. Choose what Dextana can do.
      </p>
      <div className="mcp-tool-toolbar">
        <TextInput
          aria-label="Search tools"
          type="search"
          placeholder="Search tools…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <span>
          {selected} of {connection.tools.length} enabled
        </span>
      </div>
      <div className="mcp-tool-list">
        {!connection.tools.length && (
          <div className="mcp-tools-empty">
            This server hasn’t shared any tools yet. You can test the connection again later.
          </div>
        )}
        {!!connection.tools.length && !filtered.length && (
          <div className="mcp-tools-empty">No tools match “{search}”.</div>
        )}
        {filtered.map((tool) => {
          const policy = policies[tool.name] ?? 'disabled';
          const properties = tool.inputSchema.properties as
            Record<string, { type?: string; description?: string }> | undefined;
          return (
            <CheckboxCard
              key={tool.name}
              className="mcp-tool-choice"
              label={tool.name.replace(/[_-]+/g, ' ')}
              description={tool.description || 'No description provided.'}
              icon={<Icon name="settings" />}
              aria-label={`Enable tool ${tool.name}`}
              checked={policy !== 'disabled'}
              disabled={busy}
              onChange={(event) =>
                setPolicies({ ...policies, [tool.name]: event.target.checked ? 'ask' : 'disabled' })
              }
              actions={
                <details>
                  <summary aria-label={`Inputs for ${tool.name}`}>Inputs and details</summary>
                  <div className="mcp-tool-inputs">
                    {Object.entries(properties ?? {}).map(([name, input]) => (
                      <div key={name}>
                        <strong>{name}</strong>
                        <span>
                          {typeof input?.type === 'string' ? input.type : 'Value'}
                          {Array.isArray(tool.inputSchema.required) &&
                          tool.inputSchema.required.includes(name)
                            ? ' · Required'
                            : ''}
                        </span>
                        {typeof input?.description === 'string' && <p>{input.description}</p>}
                      </div>
                    ))}
                    {!Object.keys(properties ?? {}).length && <p>No inputs required.</p>}
                  </div>
                </details>
              }
              accessory={
                <Select
                  aria-label={`Policy for ${tool.name}`}
                  value={policy}
                  disabled={busy}
                  onChange={(event) =>
                    setPolicies({ ...policies, [tool.name]: event.target.value as MCPToolPolicy })
                  }
                >
                  <option value="disabled">Disabled</option>
                  <option value="ask">Ask every time</option>
                  <option value="auto">Allow automatically</option>
                </Select>
              }
            />
          );
        })}
      </div>
      {error && (
        <p className="mcp-modal-error" role="alert">
          {error}
        </p>
      )}
      <div className="mcp-modal-footer">
        <span>Only enabled tools are available. “Ask every time” requires your approval.</span>
        <Button
          variant="primary"
          icon={<Icon name="check" />}
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? 'Saving…' : 'Save tool permissions'}
        </Button>
      </div>
    </MCPDialog>
  );
}
