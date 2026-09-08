// Presentation only: the original tool payload and stored model response stay intact.
// Decode structured replies into ordinary Markdown, preserving values without executing content.
function escape(value: unknown): string {
  return String(value ?? 'Not provided')
    .replace(/\\/g, '\\\\')
    .replace(/([`*_[\]<>|#])/g, '\\$1')
    .replace(/\r?\n/g, '  \n');
}
export function fieldLabel(value: string) {
  if (value === 'structuredContent') return 'Details';
  const words = value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
function decoded(value: unknown): unknown {
  for (let i = 0; i < 3 && typeof value === 'string'; i++) {
    try {
      const next = JSON.parse(value);
      if (typeof next !== 'object' || next === null) break;
      value = next;
    } catch {
      break;
    }
  }
  return value;
}
function scalar(value: unknown) {
  return value === true ? 'Yes' : value === false ? 'No' : escape(value);
}
function table(rows: unknown[][]) {
  if (!rows.length) return 'No entries.';
  let width = 1;
  for (const row of rows) width = Math.max(width, row.length);
  const line = (row: unknown[]) =>
    '| ' +
    Array.from({ length: width }, (_, i) => scalar(row[i]).replaceAll('\n', ' ')).join(' | ') +
    ' |';
  return [
    line(rows[0]),
    '| ' + Array(width).fill('---').join(' | ') + ' |',
    ...rows.slice(1).map(line),
  ].join('\n');
}
export function readableData(input: unknown, depth = 0): string {
  const value = decoded(input);
  if (depth > 12) return 'This result contains more detail than can be displayed here.';
  if (value === null || typeof value !== 'object') return scalar(value);
  if (Array.isArray(value)) {
    if (!value.length) return 'No entries.';
    if (value.every((item) => Array.isArray(item))) return table(value as unknown[][]);
    if (
      value.every(
        (item) =>
          item &&
          typeof item === 'object' &&
          !Array.isArray(item) &&
          Object.values(item).every((v) => decoded(v) === null || typeof decoded(v) !== 'object'),
      )
    ) {
      const keys = [...new Set(value.flatMap((item) => Object.keys(item)))];
      // Large/wide records read better as individual entries than a huge horizontal table.
      if (keys.length <= 8)
        return table([keys.map(fieldLabel), ...value.map((item) => keys.map((key) => item[key]))]);
    }
    return value
      .map((item, index) =>
        typeof item === 'object' && item !== null
          ? `**Item ${index + 1}**\n\n${readableData(item, depth + 1)}`
          : `- ${readableData(item, depth + 1)}`,
      )
      .join('\n\n');
  }
  const data = value as Record<string, unknown>;
  if (typeof data.path === 'string' && data.created === true && !data.error)
    return `Created **${escape(data.path.split(/[\\/]/).at(-1))}**.\n\nFind it in **Context → Show in folder**.`;
  // MCP content envelopes carry the useful result inside text blocks.
  if (
    Array.isArray(data.content) &&
    data.content.every((item) => item?.type === 'text' && typeof item.text === 'string')
  ) {
    const body = data.content.map((item) => readableData(item.text, depth + 1)).join('\n\n');
    const rest = Object.fromEntries(
      Object.entries(data).filter(
        ([key]) => !['content', 'isError', '_meta'].includes(key),
      ),
    );
    return [
      data.isError ? '**Couldn’t complete this action.**' : '',
      body,
      Object.keys(rest).length ? readableData(rest, depth + 1) : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  }
  return (
    Object.entries(data)
      .map(([key, child]) => {
        if (key === 'sheets' && Array.isArray(child))
          return child
            .map((sheet) =>
              sheet && typeof sheet.name === 'string' && Array.isArray(sheet.rows)
                ? `**${escape(sheet.name)}**\n\n${table(sheet.rows)}`
                : readableData(sheet, depth + 1),
            )
            .join('\n\n');
        const result = readableData(child, depth + 1);
        return typeof decoded(child) === 'object' && child !== null
          ? `**${escape(fieldLabel(key))}**\n\n${result}`
          : `**${escape(fieldLabel(key))}:** ${result}`;
      })
      .join('\n\n') || 'No details were returned.'
  );
}

function endOfJSON(text: string, start: number): number {
  let depth = 0,
    quoted = false,
    escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\' && quoted) {
      escaped = true;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (char === '{' || char === '[') depth++;
    if ((char === '}' || char === ']') && --depth === 0) return i + 1;
  }
  return -1;
}
export function readableResponse(content: string, streaming = false): string {
  let output = '',
    index = 0;
  const pending = streaming
    ? 'Preparing results…'
    : 'I couldn’t display part of this result. Ask me to summarize it again.';
  while (index < content.length) {
    const rest = content.slice(index);
    // Preserve ordinary code and A2UI fences for their existing renderers.
    if (rest.startsWith('```')) {
      const header = /^```([^\n]*)\n/.exec(rest);
      if (!header) {
        output += streaming ? '' : rest;
        break;
      }
      const end = content.indexOf('```', index + header[0].length);
      const body = content.slice(index + header[0].length, end === -1 ? undefined : end);
      if (
        /^(?:json|jsonl|application\/json)\s*$/i.test(header[1]) ||
        (!header[1].trim() && /^[\s]*[\[{]/.test(body))
      ) {
        let formatted = '';
        let remaining = body.trim();
        while (remaining) {
          const boundary = /^[\[{]/.test(remaining) ? endOfJSON(remaining, 0) : -1;
          if (boundary === -1) {
            formatted += pending;
            break;
          }
          try {
            formatted += readableData(JSON.parse(remaining.slice(0, boundary))) + '\n\n';
          } catch {
            formatted += pending;
            break;
          }
          remaining = remaining.slice(boundary).trim();
        }
        output += '\n\n' + formatted.trimEnd() + '\n\n';
      } else output += content.slice(index, end === -1 ? undefined : end + 3);
      if (end === -1) break;
      index = end + 3;
      continue;
    }
    // Numeric link labels and citations are Markdown, not a data array.
    const link = /^\[[^\]\n]*\]\([^\n]*?\)/.exec(rest);
    const citation = /^\[\d+\](?![\d,])/.exec(rest);
    if (link || citation) { const match = (link || citation)![0]; output += match; index += match.length; continue; }
    // Some providers double-encode a tool result into a JSON string.
    if (rest.startsWith('"{\\"') || rest.startsWith('"[\\"') || rest.startsWith('"[{\\"')) {
      let end = 1;
      for (; end < rest.length; end++) {
        if (rest[end] === '\\') end++;
        else if (rest[end] === '"') break;
      }
      if (end >= rest.length) {
        output += pending;
        break;
      }
      try {
        output += '\n\n' + readableResponse(JSON.parse(rest.slice(0, end + 1)), streaming) + '\n\n';
        index += end + 1;
        continue;
      } catch {
        /* Fall through to normal text. */
      }
    }
    const isObject = /^\{\s*(?:"|\}|$)/.test(rest);
    const isArray = /^\[\s*(?:\{|\[|"|-?\d|true\b|false\b|null\b|\]|$)/.test(rest);
    if (isObject || isArray) {
      const end = endOfJSON(content, index);
      if (end === -1) {
        output += pending;
        break;
      }
      try {
        output += '\n\n' + readableData(JSON.parse(content.slice(index, end))) + '\n\n';
      } catch {
        output += pending;
      }
      index = end;
      continue;
    }
    output += content[index++];
  }
  return output;
}
