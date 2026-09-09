import type { ReactNode } from 'react';

export function TableFrame({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div className="rich-table" role="region" aria-label={title || 'Table'} tabIndex={0}>
      {children}
    </div>
  );
}
export function RichTable({
  columns,
  rows,
  title,
}: {
  columns: unknown;
  rows: unknown;
  title?: string;
}) {
  const scalar = (v: unknown) => v === null || ['string', 'number', 'boolean'].includes(typeof v);
  if (
    !Array.isArray(columns) ||
    !columns.length ||
    columns.length > 30 ||
    !columns.every((c) => typeof c === 'string') ||
    !Array.isArray(rows) ||
    rows.length > 1000 ||
    !rows.every((row) => Array.isArray(row) && row.length === columns.length && row.every(scalar))
  ) {
    return (
      <p className="rich-notice">This table needs column names and equally sized rows of values.</p>
    );
  }
  return (
    <TableFrame title={title}>
      <table>
        {title && <caption>{title}</caption>}
        <thead>
          <tr>
            {columns.map((column, i) => (
              <th key={i} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell: unknown, j: number) => (
                <td key={j}>{cell === null ? '—' : String(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </TableFrame>
  );
}
