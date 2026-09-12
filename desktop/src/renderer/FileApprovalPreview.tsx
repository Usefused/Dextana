export function FileApprovalPreview({ arguments: raw }: { arguments: string }) {
  const plan = JSON.parse(raw) as {
    path: string;
    action: string;
    content?: string;
    before?: string;
    changes?: {
      target: string;
      before: string;
      after: string;
      beforeType?: string;
      afterType?: string;
    }[];
    format?: string;
    sheets?: { name: string; rows: (string | number | boolean | null)[][] }[];
  };
  return (
    <div className="file-approval-preview">
      <div className="file-destination">
        <span>
          {plan.action === 'read'
            ? 'Read document'
            : plan.action === 'edit'
              ? 'Update document'
              : 'Save new document'}
        </span>
        <p>{plan.path}</p>
      </div>
      {plan.action === 'read' ? (
        <p>The contents of this document will be shared with the selected model for this chat.</p>
      ) : plan.action === 'edit' ? (
        <>
          <p>
            {plan.changes
              ? 'Review each proposed change below. Unchanged document parts are preserved.'
              : 'Review the complete replacement below.'}{' '}
            Changes are saved only when you choose Apply changes. If the file changes in the
            meantime, Dext will ask again.
          </p>
          {plan.format === 'xlsx' && (
            <p>Formulas are preserved. Excel will recalculate them when the workbook opens.</p>
          )}
          {plan.format === 'pdf' && (
            <p>
              The PDF form remains interactive. Applying changes to a signed PDF is not allowed.
            </p>
          )}
          {plan.changes ? (
            plan.changes.map((change) => (
              <section className="file-change" key={change.target} aria-label={change.target}>
                <h4>{change.target}</h4>
                <div className="file-edit-comparison">
                  <section>
                    <h4>Current content{change.beforeType && ` · ${change.beforeType}`}</h4>
                    <pre className="document-preview">{change.before || '(Empty)'}</pre>
                  </section>
                  <section>
                    <h4>Proposed content{change.afterType && ` · ${change.afterType}`}</h4>
                    <pre className="document-preview">{change.after || '(Empty)'}</pre>
                  </section>
                </div>
              </section>
            ))
          ) : (
            <div className="file-edit-comparison">
              <section aria-label="Current file content">
                <h4>Current content</h4>
                <pre className="document-preview">{plan.before || '(Empty document)'}</pre>
              </section>
              <section aria-label="Proposed file content">
                <h4>Proposed content</h4>
                <pre className="document-preview">{plan.content || '(Empty document)'}</pre>
              </section>
            </div>
          )}
        </>
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
