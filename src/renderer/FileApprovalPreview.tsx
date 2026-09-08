export function FileApprovalPreview({ arguments: raw }: { arguments: string }) {
  const plan = JSON.parse(raw) as {
    path: string;
    action: string;
    content?: string;
    sheets?: { name: string; rows: (string | number | boolean | null)[][] }[];
  };
  return (
    <div className="file-approval-preview">
      <div className="file-destination">
        <span>{plan.action === 'read' ? 'Read document' : 'Save new document'}</span>
        <p>{plan.path}</p>
      </div>
      {plan.action === 'read' ? (
        <p>The contents of this document will be shared with the selected model for this chat.</p>
      ) : (
        <>
          <p>A new file will be saved here. Existing documents will be preserved.</p>
          {plan.content !== undefined && (
            <div className="document-preview">{plan.content || '(Empty document)'}</div>
          )}
          {plan.sheets?.map((sheet) => (
            <section key={sheet.name} className="sheet-preview">
              <strong>{sheet.name}</strong>
              <span> · {Math.max(0, sheet.rows.length - 1)} data rows</span>
              <div>
                <table aria-label={`${sheet.name} preview`}>
                  <tbody>
                    {sheet.rows.slice(0, 51).map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) =>
                          i === 0 ? (
                            <th key={j}>{String(cell ?? '')}</th>
                          ) : (
                            <td key={j}>{String(cell ?? '')}</td>
                          ),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {sheet.rows.length > 51 && (
                <p>
                  Preview shows the first 50 data rows. The file will contain all{' '}
                  {sheet.rows.length - 1} data rows.
                </p>
              )}
            </section>
          ))}
        </>
      )}
    </div>
  );
}
