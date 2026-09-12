import { Notice, Select, SettingRow } from './ui';
import { useState } from 'react';
import type { Theme } from '../shared/types';

export function AppearanceSettings({ theme, saved }: { theme: Theme; saved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  async function change(value: Theme) {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await window.dextana.setTheme(value);
      await saved();
      setStatus('Appearance saved');
    } catch { setError('Could not save your appearance. Please try again.'); }
    finally { setBusy(false); }
  }
  return <section className="settings-card appearance-settings">
    <SettingRow title="Color theme" description="Choose a look, or follow your device’s appearance.">
      <Select aria-label="Color theme" value={theme} disabled={busy} onChange={event => void change(event.target.value as Theme)}>
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </Select>
    </SettingRow>
    {status && <Notice tone="success">{status}</Notice>}
    {error && <Notice tone="danger">{error}</Notice>}
  </section>;
}
