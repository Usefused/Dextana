import { useState, type ReactNode } from 'react';
import { externalURL } from '../shared/links';
const fileType = (value: string) => value.split(/[?#]/)[0].match(/\.(pdf|docx?|xlsx?|csv|txt|md|pptx?|zip|png|jpe?g)$/i)?.[1].toLowerCase();
export function UIReference({ target, label }: { target: string; label?: string }) {
  const [error, setError] = useState('');
  const url = externalURL(target);
  const type = fileType(target);
  const name = label || (url ? new URL(url).hostname : target.split(/[\\/]/).at(-1)) || target;
  const icon = <span className={`ui-reference-icon ${type ? 'file-' + type : 'website'}`} role="img" aria-label={type ? `${type.toUpperCase()} file` : url ? 'Website' : 'File'}>
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      {url && !type ? <><circle cx="10" cy="10" r="7" /><ellipse cx="10" cy="10" rx="3" ry="7" /><path d="M3 10h14" /></> : <><path d="M5 2h6l4 4v12H5zM11 2v4h4M7 10h6M7 13h4" /></>}
    </svg>
    {type && <span>{type.toUpperCase()}</span>}
  </span>;
  const content = <>{icon}<span>{name}</span></>;
  return <span className="ui-reference-wrap">
    {url ? <a className="ui-reference" href={url} title={target} onClick={event => { event.preventDefault(); setError(''); void window.dextana.openLink(url).catch(() => setError('Could not open this link.')); }}>{content}</a> : <span className="ui-reference" title={target}>{content}</span>}
    {error && <span role="alert">{error}</span>}
  </span>;
}
export function ReferenceText({ text }: { text: string }) {
  const pattern = /\[([^\]\n]+)\]\(([^\s)]+)\)|https?:\/\/[^\s<>]+|(?:[\w./\\-]+\.(?:pdf|docx?|xlsx?|csv|txt|md|pptx?|zip|png|jpe?g))\b/gi;
  const parts: ReactNode[] = []; let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    parts.push(text.slice(cursor, match.index));
    const target = match[2] ?? match[0].replace(/[.,;!?]+$/, '');
    if (externalURL(target) || (!/^[a-z][a-z\d+.-]*:/i.test(target) && fileType(target))) parts.push(<UIReference key={match.index} target={target} label={match[1]} />);
    else parts.push(match[0]);
    if (!match[2]) parts.push(match[0].slice(target.length));
    cursor = match.index! + match[0].length;
  }
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}
