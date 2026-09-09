import { useEffect, useState } from 'react';
import type { FusedCLIStatus } from '../shared/types';
import { Button, Icon } from './ui';
import './fused-cli-setup.css';

export function FusedCLISetup({ ready }: { ready: (value: boolean) => void }) {
  const [status, setStatus] = useState<FusedCLIStatus>();
  const [error, setError] = useState('');
  const busy = !!status && ['checking', 'downloading', 'verifying', 'installing'].includes(status.phase);
  useEffect(() => {
    let mounted = true;
    void window.dextana.checkFusedCLI().then(value => { if (mounted) setStatus(value); }).catch(() => { if (mounted) setError('Could not check Fused setup. Please try again.'); });
    const timer = setInterval(() => {
      void window.dextana.fusedCLIStatus().then(value => { if (mounted) setStatus(value); }).catch(() => {});
    }, 750);
    return () => { mounted = false; clearInterval(timer); };
  }, []);
  useEffect(() => { ready(!!status?.active && !busy); }, [status?.active, busy, ready]);
  async function action(operation: () => Promise<FusedCLIStatus>) {
    setError('');
    try { setStatus(await operation()); } catch (failure) { setError((failure as Error).message); }
  }
  const active = status?.active && status[status.active];
  const installing = status && ['downloading', 'verifying', 'installing'].includes(status.phase);
  const percentage = status?.total ? Math.min(100, Math.round((status.downloaded ?? 0) / status.total * 100)) : 0;
  const installed = status?.managed?.version === status?.recommendedVersion;
  return <section className="fused-cli-setup" aria-label="Fused CLI setup" aria-busy={busy}>
    <div className="fused-cli-heading"><span className="fused-cli-symbol" aria-hidden="true">↓</span><div><h3>Get Fused ready</h3><p>Requires fused-cli. Dextana can install it for you.</p></div>{active && <span className="fused-cli-ready">Ready</span>}</div>
    {!status && !error && <p role="status">Checking this computer…</p>}
    {active && <p className="fused-cli-current">Using {status?.active === 'managed' ? 'Dextana’s installation' : 'your existing installation'} · {active.version}</p>}
    {status?.existing && !status.existing.compatible && <p>Your existing CLI isn’t compatible with this version of Dextana. Install the supported version below.</p>}
    {!active && status && !installing && <p>Set up once, then sign in. No terminal commands or administrator access needed.</p>}
    {installing && <div className="fused-cli-progress" role="status"><div><span>{status.phase === 'downloading' ? 'Downloading Fused CLI…' : status.phase === 'verifying' ? 'Verifying download…' : 'Checking installation…'}</span><span>{status.phase === 'downloading' ? `${percentage}%` : ''}</span></div><progress aria-label="Fused CLI installation progress" max={100} value={status.phase === 'downloading' ? percentage : undefined}/></div>}
    {(error || status?.error) && <p role="alert" className="settings-error">{error || status?.error}</p>}
    {status?.message && !installing && <p role="status">{status.message}</p>}
    <div className="fused-cli-actions">
      {status?.supported && !installed && !installing && <Button icon={<Icon name="upload" />} variant="primary" busy={busy} onClick={() => void action(() => window.dextana.installFusedCLI())}>{status.phase === 'error' ? 'Retry installation' : status.managed ? `Update to ${status.recommendedVersion}` : 'Install for Dextana'}</Button>}
      {status?.existing?.compatible && status.active !== 'existing' && <Button icon={<Icon name="check" />} disabled={busy} onClick={() => void action(() => window.dextana.useExistingFusedCLI())}>Use existing installation</Button>}
      {!status?.existing?.compatible && <Button icon={<Icon name="folder" />} variant="ghost" disabled={busy} onClick={() => void action(() => window.dextana.chooseFusedCLI())}>Locate installed CLI</Button>}
      {installed && status?.active !== 'managed' && <Button icon={<Icon name="check" />} disabled={busy} onClick={() => void action(() => window.dextana.useManagedFusedCLI())}>Use Dextana’s installation</Button>}
      {status?.phase === 'downloading' ? <Button icon={<Icon name="close" />} variant="ghost" onClick={() => void window.dextana.cancelFusedCLIInstall()}>Cancel download</Button> : <Button icon={<Icon name="refresh" />} variant="ghost" disabled={busy} onClick={() => void action(() => window.dextana.checkFusedCLI())}>Check again</Button>}
    </div>
    {status?.supported && !installed && <p className="fused-cli-footnote">Version {status.recommendedVersion} · Verified download from Fused · Installed only for Dextana</p>}
    {status && !status.supported && <p>Private installation isn’t available on this platform yet. A compatible CLI on PATH can still be used.</p>}
  </section>;
}
