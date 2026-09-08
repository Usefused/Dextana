export function externalURL(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  try {
    const url = new URL(value);
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password)
      return url.href;
  } catch {
    /* Relative paths and executable URLs are not external web links. */
  }
}
