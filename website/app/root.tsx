import { BrandLockup } from './Brand';
import dextLogo from './assets/dext-logo.svg?url&no-inline';
import { Links, Meta, Outlet, Scripts, ScrollRestoration, isRouteErrorResponse, useRouteError } from '@remix-run/react';
import type { LinksFunction } from '@remix-run/node';
import stylesheet from './styles.css?url';

export const links: LinksFunction = () => [
  { rel: 'stylesheet', href: stylesheet },
  { rel: 'icon', href: dextLogo, type: 'image/svg+xml' },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><head><meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="theme-color" content="#365f4c" /><Meta /><Links /></head><body>{children}<ScrollRestoration /><Scripts /></body></html>;
}

export default function App() { return <Outlet />; }

export function ErrorBoundary() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return <main className="error-page"><BrandLockup /><h1>{notFound ? 'A little off track.' : 'Something went wrong.'}</h1><p>{notFound ? 'That page isn’t here. Let’s get you back to Dext.' : 'Please try again in a moment.'}</p><a className="button primary" href="/">Back to Dextana <span aria-hidden="true">↗</span></a></main>;
}
