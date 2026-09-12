import { Button, CheckboxField, Icon, TextInput } from './ui';
import { useState } from 'react';
import type { FusedAccount, FusedIntegration } from '../shared/types';

export function FusedSettings({
  integrations,
  saved,
}: {
  integrations: FusedIntegration[];
  saved: () => Promise<void>;
}) {
  const [message, setMessage] = useState('');
  async function onSaved(message = 'Fused connection saved') {
    await saved();
    setMessage(message);
  }
  return (
    <>
      <div className="settings-card">
        <h2>
          Saved Fused connections
        </h2>
        <p>
          Your previously saved Fused connections. Add new servers using the Fused setup option above.
        </p>
        {integrations.map((config) => (
          <FusedConnection
            key={`${config.id}:${config.revision}`}
            config={config}
            saved={onSaved}
          />
        ))}
        {message && (
          <p role="status" className="success">
            {message}
          </p>
        )}

      </div>
    </>
  );
}
export function AccountConnection({
  account,
  saved,
}: {
  account?: FusedAccount;
  saved: () => Promise<void>;
}) {
  const [url, setUrl] = useState(account?.url ?? '');
  const [licenseKey, setLicenseKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(remove = false) {
    setBusy(true);
    setError('');
    try {
      if (remove) await window.dextana.removeFusedAccount();
      else await window.dextana.saveFusedAccount({ url, licenseKey });
      setLicenseKey('');
      await saved();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-card" aria-label="Your Fused account">
      <h2>Your Fused account</h2>
      <p>Already have Fused? Connect your account using your Engine URL and license key.</p>
      {account && (
        <p role="status" className="success">
          Account connected · License key saved securely on this device
        </p>
      )}
      <label>
        Fused URL
        <TextInput
          value={url}
          placeholder="https://your-fused-engine"
          disabled={busy}
          onChange={(event) => setUrl(event.target.value)}
        />
      </label>
      <label>
        Fused license key
        <TextInput
          type="password"
          autoComplete="off"
          value={licenseKey}
          disabled={busy}
          placeholder={account ? 'Saved securely · leave blank to keep' : 'Enter your license key'}
          onChange={(event) => setLicenseKey(event.target.value)}
        />
      </label>
      <p className="secret-note">
        Your key is encrypted locally using your system keyring. It is never included in agent
        messages. MCP integrations below use their own execution tokens.
      </p>
      <div className="fused-actions">
        <Button icon={<Icon name="plug" />} variant="primary" disabled={busy || !url.trim()} onClick={() => void run()}>
          {busy ? 'Working…' : account ? 'Update Fused account' : 'Connect Fused account'}
        </Button>
        {account && (
          <Button icon={<Icon name="trash" />} variant="secondary" disabled={busy} onClick={() => void run(true)}>
            Disconnect Fused account
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
function FusedConnection({
  config,
  saved,
  cancel,
}: {
  config?: FusedIntegration;
  saved: (message?: string) => Promise<void>;
  cancel?: () => void;
}) {
  const [name, setName] = useState(config?.name ?? 'Fused');
  const [enabled, setEnabled] = useState(config?.enabled ?? false);
  const [url, setUrl] = useState(config?.url ?? '');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    setError('');
    try {
      await window.dextana.saveFused({ id: config?.id, name, enabled, url, token });
      setToken('');
      await saved();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="fused-connection"
      aria-label={config ? `Fused integration ${config.name}` : 'New Fused integration'}
    >
      <label>
        Integration name
        <TextInput value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
      </label>
      <CheckboxField label="Enable Fused" description="Make this integration available to Dextana."
        checked={enabled} onChange={event => setEnabled(event.target.checked)} />
      <label>
        Fused MCP address
        <TextInput
          placeholder="https://your-engine/mcp/your-version-id/mcp"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
      </label>
      <label>
        Fused execution token
        <TextInput
          type="password"
          autoComplete="off"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder={
            config?.hasToken
              ? 'Saved securely · leave blank to keep'
              : 'Paste your MCP execution token'
          }
        />
      </label>
      <p className="secret-note">
        Encrypted with your system keyring. Changing the address requires a new token. MCP actions
        follow the permissions for each chat.
      </p>
      <div className="fused-actions">
        <Button icon={<Icon name="check" />} variant="primary" disabled={busy || !name.trim()} onClick={save}>
          Save Fused connection
        </Button>
        {config && (
          <Button icon={<Icon name="trash" />} variant="secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                await window.dextana.removeFused(config.id);
                await saved('Fused integration removed');
              } catch (failure) {
                setError((failure as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Remove integration
          </Button>
        )}
        {cancel && (
          <Button icon={<Icon name="close" />} variant="secondary" onClick={cancel}>
            Cancel
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
