import { Button, EmptyState, Select, Icon } from './ui';
import { useEffect, useState } from 'react';
import type { UsageSummary } from '../shared/types';

export function UsageSettings() {
  const [period, setPeriod] = useState<'7d' | '30d' | 'all'>('30d');
  const [usage, setUsage] = useState<UsageSummary>();
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let live = true; setUsage(undefined); setError('');
    void window.dextana.usage(period).then(value => { if (live) setUsage(value); }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [period, refresh]);
  const count = (value: number) => value.toLocaleString();
  return <div>
    <div className="settings-section-heading"><div><h2>Token usage</h2><p>Model usage from your chats and scheduled jobs.</p></div><div className="settings-actions"><Select aria-label="Usage period" value={period} onChange={e => setPeriod(e.target.value as typeof period)}><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="all">All time</option></Select><Button icon={<Icon name="refresh" />} variant="secondary" onClick={() => setRefresh(value => value + 1)}>Refresh</Button></div></div>
    {error && <p role="alert" className="settings-error">{error}</p>}
    {!usage ? !error && <p className="settings-empty">Loading usage…</p> : <>
      <div className="usage-totals">{([['Input tokens', usage.inputTokens], ['Output tokens', usage.outputTokens], ['Total tokens', usage.totalTokens]] as const).map(([label, value]) => <div key={label}><span>{label}</span><strong>{usage.reportedCalls ? count(value) : '—'}</strong></div>)}</div>
      <p className="settings-caption">{count(usage.calls)} model calls with reported usage</p>
      {!usage.calls ? <EmptyState title="Your usage will appear here" description="Start a chat with a connected model to see its reported token usage." /> : <div className="usage-table-wrap"><table aria-label="Usage by model" className="usage-table"><thead><tr><th>Model</th><th>Reported calls</th><th>Input</th><th>Output</th><th>Total</th></tr></thead><tbody>{usage.models.map(row => <tr key={`${row.provider}:${row.model}`}><td><strong>{row.model}</strong><span>{row.provider === 'ollama' ? 'Ollama' : 'OpenAI-compatible'}</span></td><td>{count(row.calls)}</td><td>{row.reportedCalls ? count(row.inputTokens) : '—'}</td><td>{row.reportedCalls ? count(row.outputTokens) : '—'}</td><td>{row.reportedCalls ? count(row.totalTokens) : '—'}</td></tr>)}</tbody></table></div>}
      <p className="settings-footnote">Counts are reported by your model provider, including tool-call turns. Missing counts are not estimated. Tracking starts with this version of Dextana; this is not your provider’s billing or quota dashboard.</p>
    </>}
  </div>;
}
