import { useEffect, useState } from 'react';
import type {
  IntegrationProvider,
  IntegrationsCommand,
  IntegrationsResult,
} from '../shared/integrations';
import {
  Badge,
  Button,
  Card,
  CheckboxCard,
  Field,
  Icon,
  Modal,
  Notice,
  SearchInput,
  TextInput,
} from './ui';
import './integrations-settings.css';

export function IntegrationsSettings() {
  const [view, setView] = useState<IntegrationsResult>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [details, setDetails] = useState<IntegrationProvider>();
  const [dialog, setDialog] = useState<'register' | 'login' | 'verify'>();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [challengeId, setChallengeId] = useState('');
  async function run(command: IntegrationsCommand) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await window.dextana.integrations(command);
      setView(result);
      if (result.challengeId) {
        setChallengeId(result.challengeId);
        setDialog('verify');
      }
      if (command.action === 'verify') {
        setDialog(undefined);
        setCode('');
      }
      if (command.action === 'connect')
        setMessage('Finish connecting in your browser, then choose “Activate connections”.');
      if (command.action === 'activate')
        setMessage('Your connected integrations are ready to use in chat.');
      return result;
    } catch (failure) {
      setError(
        (failure as Error).message.replace(
          /^Error invoking remote method '[^']+': (?:Error: )?/,
          '',
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void run({ action: 'view' });
  }, []);
  const account = view?.account;
  const connected = view?.configured && view.connected !== false;
  const canSubscribe = connected && view?.catalog?.availability?.subscribe !== false;
  const canSignIn = connected && view?.catalog?.availability?.signIn !== false;
  const providers =
    view?.catalog?.providers.filter((provider) =>
      `${provider.name} ${provider.operations.map((op) => op.name).join(' ')}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    ) ?? [];
  function enable(provider: IntegrationProvider, enabled: boolean) {
    if (!account) {
      setDialog('register');
      return;
    }
    if (!account.subscribed) {
      void run({ action: 'checkout' });
      return;
    }
    void run({ action: 'enable', provider: provider.id, enabled });
  }
  return (
    <section className="integrations-settings" aria-label="Dext Integrations">
      <Card className="integrations-membership">
        <div>
          <Badge>{account?.subscribed ? 'Subscribed' : 'Dext Integrations'}</Badge>
          <h2>{account ? `Welcome, ${account.username}` : 'Your apps, ready for Dext'}</h2>
          <p>Connect the services you use and let Dext work with your account. £10 per month.</p>
        </div>
        <div className="dx-actions">
          {!account ? (
            <>
              <Button
                icon={<Icon name="plus" />}
                variant="primary"
                disabled={busy}
                onClick={() => setDialog('register')}
              >
                Subscribe · £10/month
              </Button>
              <Button
                icon={<Icon name="arrow" />}
                disabled={busy || !canSignIn}
                onClick={() => setDialog('login')}
              >
                Sign in
              </Button>
              <Button
                icon={<Icon name="refresh" />}
                variant="ghost"
                disabled={busy}
                onClick={() => void run({ action: 'view' })}
              >
                Refresh status
              </Button>
            </>
          ) : (
            <>
              <Button
                icon={<Icon name="refresh" />}
                disabled={busy}
                onClick={() => void run({ action: 'view' })}
              >
                Refresh status
              </Button>
              <Button
                icon={<Icon name="settings" />}
                disabled={busy}
                onClick={() => {
                  if (!account.subscribed && !canSubscribe) {
                    setUsername(account.username);
                    setEmail(account.email);
                    setDialog('register');
                  } else void run({ action: account.subscribed ? 'billing' : 'checkout' });
                }}
              >
                {account.subscribed ? 'Manage subscription' : 'Subscribe · £10/month'}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void run({ action: 'logout' })}
              >
                Sign out
              </Button>
            </>
          )}
        </div>
      </Card>
      {view && !view.configured && (
        <Notice>
          Subscriptions will be available once the Dext Integrations service is connected. You can
          browse the supported integrations below.
        </Notice>
      )}
      {view?.configured && view.connected === false && (
        <Notice>
          Cannot reach Dext Integrations. You can browse the supported integrations below and
          refresh the status when the service is available.
        </Notice>
      )}
      {connected && !canSubscribe && (
        <Notice>
          Connected to Dext Integrations. Subscriptions are being set up. You can browse the
          supported integrations below.
        </Notice>
      )}
      {account?.subscribed && account.enabled.length > 0 && (
        <div className="integrations-activation">
          <span>After connecting your accounts, activate them for use in chat.</span>
          <Button
            icon={<Icon name="check" />}
            variant="primary"
            disabled={busy}
            onClick={() => void run({ action: 'activate' })}
          >
            Activate connections
          </Button>
        </div>
      )}
      {message && <Notice tone="success">{message}</Notice>}
      {error && !dialog && <Notice tone="danger">{error}</Notice>}
      <SearchInput
        label="Search integrations"
        placeholder="Search integrations or actions"
        value={search}
        onChange={(value) => {
          setSearch(value);
          if (!value) setQuery('');
        }}
        onSearch={setQuery}
      />
      <div className="integrations-grid">
        {providers.map((provider) => (
          <CheckboxCard
            key={provider.id}
            label={provider.name}
            icon={<Icon name="plug" />}
            checked={account?.enabled.includes(provider.id) ?? false}
            disabled={busy || !connected || (!account?.subscribed && !canSubscribe)}
            onChange={(event) => enable(provider, event.target.checked)}
            description={`${provider.operations.length} available actions`}
            actions={
              <>
                <Button
                  icon={<Icon name="arrow" />}
                  variant="ghost"
                  size="small"
                  onClick={() => setDetails(provider)}
                >
                  View operations
                </Button>
                {account?.subscribed && account.enabled.includes(provider.id) && (
                  <Button
                    icon={<Icon name="key" />}
                    size="small"
                    disabled={busy}
                    onClick={() => void run({ action: 'connect', provider: provider.id })}
                  >
                    Connect account
                  </Button>
                )}
              </>
            }
          />
        ))}
      </div>
      {view?.catalog && !providers.length && <p>No integrations match your search.</p>}
      {details && (
        <Modal
          title={details.name}
          description={`${details.operations.length} actions you can use with this integration.`}
          close={() => setDetails(undefined)}
        >
          <ul className="integration-operations">
            {details.operations.map((op) => (
              <li key={op.id}>
                <Icon name="check" />
                <span>{op.name}</span>
              </li>
            ))}
          </ul>
        </Modal>
      )}
      {dialog && (
        <Modal
          title={
            dialog === 'register'
              ? 'Join Dext Integrations'
              : dialog === 'login'
                ? 'Sign in to Dext Integrations'
                : 'Verify your email'
          }
          busy={busy}
          close={() => setDialog(undefined)}
          description={
            dialog === 'register'
              ? canSubscribe
                ? '£10 per month. Continue to Stripe to subscribe, then verify your email to connect your apps.'
                : '£10 per month. Checkout will be available once subscription setup is complete.'
              : dialog === 'verify'
                ? 'Enter the 8-digit code sent to your email. Complete payment in your browser, then refresh your status here.'
                : 'We’ll send a sign-in code to your email.'
          }
        >
          <form
            className="integrations-signup"
            onSubmit={(event) => {
              event.preventDefault();
              if (dialog === 'register' && !canSubscribe) {
                void run({ action: 'view' });
                return;
              }
              void run(
                dialog === 'register'
                  ? account
                    ? { action: 'checkout' }
                    : { action: 'register', username, email }
                  : dialog === 'login'
                    ? { action: 'login', email }
                    : { action: 'verify', challengeId, code },
              );
            }}
          >
            {dialog === 'register' && !canSubscribe && (
              <Notice>
                {connected
                  ? 'The service is connected. Payment and email setup must be completed before checkout can open.'
                  : 'The integrations service is unavailable. Check availability to try connecting again.'}
              </Notice>
            )}
            {dialog === 'register' && (
              <Field label="Username">
                {(field) => (
                  <TextInput
                    {...field}
                    autoComplete="username"
                    readOnly={Boolean(account)}
                    required
                    minLength={3}
                    maxLength={32}
                    pattern="[A-Za-z][A-Za-z0-9_-]{2,31}"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                  />
                )}
              </Field>
            )}
            {dialog !== 'verify' ? (
              <Field label="Email">
                {(field) => (
                  <TextInput
                    {...field}
                    type="email"
                    autoComplete="email"
                    readOnly={dialog === 'register' && Boolean(account)}
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                )}
              </Field>
            ) : (
              <Field label="Verification code">
                {(field) => (
                  <TextInput
                    {...field}
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="[0-9]{8}"
                    required
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                  />
                )}
              </Field>
            )}
            {error && <Notice tone="danger">{error}</Notice>}
            <Button
              icon={<Icon name={dialog === 'verify' ? 'check' : 'arrow'} />}
              variant="primary"
              type={dialog === 'register' && !canSubscribe ? 'button' : 'submit'}
              onClick={
                dialog === 'register' && !canSubscribe
                  ? () => void run({ action: 'view' })
                  : undefined
              }
              disabled={busy}
            >
              {busy
                ? 'Working…'
                : dialog === 'register'
                  ? canSubscribe
                    ? 'Continue to Stripe · £10/month'
                    : 'Check availability'
                  : dialog === 'login'
                    ? 'Send sign-in code'
                    : 'Verify email'}
            </Button>
            {dialog === 'verify' && (
              <Button variant="ghost" disabled={busy} onClick={() => setDialog('login')}>
                Send a new code
              </Button>
            )}
          </form>
        </Modal>
      )}
    </section>
  );
}
