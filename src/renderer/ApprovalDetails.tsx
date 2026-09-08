import { type ReactNode } from 'react';
import { fieldLabel } from '../shared/readable-results';

// Approval values are proposed inputs, never evidence that an action succeeded.
export function ApprovalDetails({ arguments: raw }: { arguments: string }) {
  function fields(value: unknown, depth = 0): ReactNode {
    if (typeof value === 'string' && depth < 20) {
      try {
        const nested = JSON.parse(value);
        if (nested !== null && typeof nested === 'object') return fields(nested, depth + 1);
      } catch { /* Ordinary text is displayed literally. */ }
    }
    if (value === null) return <span>Not provided</span>;
    if (typeof value === 'boolean') return <span>{value ? 'Yes' : 'No'}</span>;
    if (typeof value !== 'object') return <span className="approval-value">{String(value)}</span>;
    if (Array.isArray(value)) return value.length ? <ol>{value.map((item, index) => <li key={index}>{fields(item, depth + 1)}</li>)}</ol> : <span>No entries</span>;
    return <dl>{Object.entries(value).map(([key, child]) => <div key={key}><dt>{fieldLabel(key)}</dt><dd>{fields(child, depth + 1)}</dd></div>)}</dl>;
  }
  let value: unknown;
  try { value = JSON.parse(raw); } catch { value = 'The action details could not be displayed. Deny this request and ask Dextana to try again.'; }
  return <div className={raw.length <= 250 ? "approval-details compact" : "approval-details"}>{fields(value)}</div>;
}
