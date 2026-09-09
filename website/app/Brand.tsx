import dextLogo from './assets/dext-logo.svg?url&no-inline';

export const brandName = 'Dextana by Fused';
export const fusedUrl = 'https://usefused.com';
export const FusedLink = () => <a className="fused-link" href={fusedUrl}>Fused</a>;
export const BrandName = () => <span className="brand-name">Dextana by <FusedLink /></span>;

export function BrandLockup({ alpha = false }: { alpha?: boolean }) {
  return <div className="brand-lockup"><div className="brand-row"><a className="brand" href="/" aria-label={`${brandName} home`}><img src={dextLogo} alt="" width="37" height="37" />Dextana</a>{alpha && <span className="alpha-tag">ALPHA</span>}</div><span className="brand-attribution">by <FusedLink /></span></div>;
}
