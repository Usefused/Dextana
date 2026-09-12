import { useState } from 'react';
import { Badge, Card, CheckboxCard, Icon, Notice } from './ui';

export function BackgroundServiceSettings({ enabled }: { enabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  async function change(value: boolean) {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await window.dextana.setDesktopBackground(value);
      setStatus('Background preference saved.');
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="automation-settings" aria-label="Background service settings">
      <CheckboxCard
        selection="switch"
        icon={<Icon name="desktop" />}
        label="Run in the background"
        aria-label="Keep Dextana running when its window closes"
        description="Keep Dextana available for timers, reminders and folder workflows after you close its window."
        checked={enabled}
        disabled={busy}
        onChange={(event) => void change(event.target.checked)}
        accessory={<Badge>{enabled ? 'Background enabled' : 'Close to quit'}</Badge>}
      />
      <Card>
        <h2>When Dextana is closed</h2>
        <p>
          {enabled
            ? 'Closing the window leaves Dextana running in the menu bar. Open it again from the Dextana menu.'
            : 'Closing the window quits Dextana. Reopen the app to resume local work.'}
        </p>
        <p>
          Fully quitting Dextana stops local timers and folder monitoring. Alerts wait until the app
          runs again or your device wakes.
        </p>
      </Card>
      {status && <Notice tone="success">{status}</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}
    </section>
  );
}
