export type ModelAuth = {
  mode: 'bearer' | 'custom';
  headers: Record<string, string>;
  body: Record<string, unknown>;
};
export const defaultModelAuth = (): ModelAuth => ({ mode: 'bearer', headers: {}, body: {} });
const reserved = new Set([
  'model',
  'messages',
  'input',
  'tools',
  'tool_choice',
  'functions',
  'function_call',
  'stream',
  'response_format',
]);
export function modelAuth(value: unknown, reservedFields = reserved): ModelAuth {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Enter a valid authentication configuration.');
  const auth = value as ModelAuth;
  if (!['bearer', 'custom'].includes(auth.mode))
    throw new Error('Choose an authentication method.');
  const object = (item: unknown): item is Record<string, unknown> =>
    !!item && typeof item === 'object' && !Array.isArray(item);
  if (
    !object(auth.headers) ||
    !object(auth.body) ||
    Object.keys(auth.headers).length > 16 ||
    JSON.stringify(auth).length > 24000
  )
    throw new Error(
      'Use up to 16 headers and an authentication configuration under 24,000 characters.',
    );
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(auth.headers)) {
    const lower = name.toLowerCase();
    if (
      !/^[!#$%&'*+.^_`|~0-9a-z-]+$/i.test(name) ||
      [
        'host',
        'content-length',
        'transfer-encoding',
        'connection',
        'content-type',
      ].includes(lower) ||
      lower in headers ||
      typeof value !== 'string' ||
      /[\r\n\x00]/.test(value) ||
      value.length > 8192 ||
      !value.trim()
    )
      throw new Error('Use unique valid header names and non-empty values without line breaks.');
    headers[lower] = value.trim();
  }
  if (auth.mode === 'bearer' && headers.authorization)
    throw new Error('Choose Custom authentication to supply your own Authorization header.');
  function validate(item: unknown, depth = 0) {
    if (depth > 8) throw new Error('Authentication body is too deeply nested.');
    if (object(item))
      for (const [key, child] of Object.entries(item)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key))
          throw new Error('Invalid authentication body field.');
        validate(child, depth + 1);
      }
    else if (Array.isArray(item)) item.forEach((child) => validate(child, depth + 1));
    else if (item !== null && !['string', 'number', 'boolean'].includes(typeof item))
      throw new Error('Authentication body must be JSON.');
  }
  if (Object.keys(auth.body).some((key) => reservedFields.has(key.toLowerCase())))
    throw new Error('Authentication body fields cannot replace protocol input or tool settings.');
  validate(auth.body);
  return { mode: auth.mode, headers, body: structuredClone(auth.body) };
}
export function modelHeaders(apiKey: string, auth: ModelAuth): Record<string, string> {
  return {
    ...(auth.mode === 'bearer' && apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    ...auth.headers,
  };
}
