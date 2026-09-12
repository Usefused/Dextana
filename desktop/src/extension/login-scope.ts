import { getDomain } from 'tldts';

export function loginAccess(address: string, selected: string[]) {
  const url = new URL(address);
  const cookies = selected.includes('cookies');
  const hosts = [url.hostname];
  if (cookies && url.protocol === 'https:') {
    // Include private suffixes: a tenant must never request its hosting platform.
    const domain = getDomain(url.hostname, { allowPrivateDomains: true });
    let parent = url.hostname;
    while (domain && parent !== domain && parent.endsWith('.' + domain)) {
      parent = parent.slice(parent.indexOf('.') + 1);
      hosts.push(parent);
    }
  }
  return {
    permissions: cookies ? ['cookies'] : [],
    // Chrome checks a cookie's own domain and Secure flag, even when getAll is
    // filtered to one HTTPS page. Exact hosts include shared parent cookies;
    // no wildcard subdomains, sibling sites or public suffixes are requested.
    origins:
      cookies && url.protocol === 'https:'
        ? hosts.map((host) => `*://${host}/*`)
        : [url.origin + '/*'],
  };
}
