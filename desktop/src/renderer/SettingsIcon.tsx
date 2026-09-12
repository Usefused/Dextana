const paths: Record<string, string> = {
  computer: 'M3 4h18v12H3zM8 21h8m-4-5v5',
  integrations: 'M7 3v5m6-5v5M5 8h10v2a5 5 0 0 1-10 0V8Zm5 7v3',
  browser: 'M3 8h18M6 5h.01M9 5h.01M3 3h18v18H3z',
  background: 'M12 3v9M6 5a9 9 0 1 0 12 0',
  appearance: 'M12 3a9 9 0 1 0 9 9c0-1-.7-1.5-1.5-1.5H17a2 2 0 0 1-2-2c0-1 1-2 1-3S14 3 12 3ZM7 10h.01M9 6.5h.01M6.5 14h.01',
  models: 'M8 3v3m8-3v3M8 18v3m8-3v3M3 8h3m12 0h3M3 16h3m12 0h3M6 6h12v12H6zM9 9h6v6H9z',
  usage: 'M4 20h16M5 16V9h3v7zm6 0V4h3v12zm6 0v-5h3v5z',
  skills: 'M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-3H4zm9 3a3 3 0 0 1 3-3h4v14h-3a4 4 0 0 0-4 3',
  mcp: 'M8 3v5m8-5v5M6 8h12v3a6 6 0 0 1-12 0zm6 9v4',
};
export function SettingsIcon({ name }: { name: string }) {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;
}
