import { Button } from './ui';
import { useState } from 'react';
import { externalURL } from '../shared/links';
import { rasterDataURL } from '../shared/images';

export function RichImage({ src = '', alt = 'Image' }: { src?: string; alt?: string }) {
  // Keyed by source by the caller: a streamed URL change cannot retain an older image.
  const [loaded, setLoaded] = useState(rasterDataURL(src) ? src : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const url = externalURL(src);
  return (
    <span className={`rich-image ${expanded ? 'expanded' : ''}`}>
      {loaded ? (
        <Button variant="layout"
          className="image-preview"
          aria-label={`${expanded ? 'Fit' : 'Enlarge'} image: ${alt}`}
          onClick={() => setExpanded(!expanded)}
        >
          <img
            src={loaded}
            alt={alt}
            loading="lazy"
            onError={() => {
              setLoaded('');
              setError('This image could not be decoded.');
            }}
          />
        </Button>
      ) : (
        <span className="image-placeholder">
          <svg
            width="30"
            height="30"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <circle cx="8" cy="8" r="1.5" />
            <path d="m3 17 5-5 4 4 3-3 6 6" />
          </svg>
          <strong>{alt}</strong>
          {url ? (
            <>
              <span>{new URL(url).hostname} · Loads when opened</span>
              <Button variant="layout"
                disabled={busy}
                aria-label={`Show image: ${alt}`}
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  try {
                    setLoaded(await window.dextana.loadImage(url));
                  } catch {
                    setError('Could not load this image. Check the address or try again.');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? 'Loading image…' : 'Show image'}
              </Button>
            </>
          ) : (
            <span>Image source is unavailable or unsupported.</span>
          )}
        </span>
      )}
      {loaded && <span className="image-caption">{alt}</span>}
      {error && (
        <span role="status" className="rich-notice">
          {error}
        </span>
      )}
    </span>
  );
}
