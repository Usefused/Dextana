import type { ComponentProps } from 'react';
import { Button } from './index';

const paths = {
  archive: 'M4 8v13h16V8M3 3h18v5H3V3ZM9 12h6',
  sidebar: 'M9 3v18M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z',
  desktop: 'M4 3h16a1 1 0 0 1 1 1v12H3V4a1 1 0 0 1 1-1ZM8 21h8M12 16v5',
  plus: 'M12 5v14M5 12h14',
  edit: 'm16 3 5 5-12 12-6 1 1-6L16 3Zm-1 1 5 5',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  play: 'm8 4 12 8-12 8V4Z',
  pause: 'M8 4v16M16 4v16',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5',
  folder: 'M3 7V4h6l3 3h9v13H3V7Z',
  plug: 'M8 3v5m8-5v5M5 8h14v3a7 7 0 0 1-14 0V8Zm7 10v3',
  close: 'm6 6 12 12M18 6 6 18',
  chevron: 'm7 10 5 5 5-5',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  refresh: 'M20 11a8 8 0 1 0-2 6M20 4v7h-7',
  browser:
    'M3 8h18M7 5h.01M10 5h.01M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z',
  shield: 'M12 3 4 6v5c0 5 8 10 8 10s8-5 8-10V6l-8-3Z M9 12l2 2 4-4',
  plan: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  check: 'm5 12 4 4L19 6',
  target: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  gear: 'M10 2h4l.6 2.5 2 1.2L19 5l2 3.5-1.8 1.8v2.4L21 14.5 19 18l-2.4-.7-2 1.2L14 21h-4l-.6-2.5-2-1.2L5 18l-2-3.5 1.8-1.8v-2.4L3 8.5 5 5l2.4.7 2-1.2L10 2ZM15 11.5a3 3 0 1 0-6 0 3 3 0 0 0 6 0',
  external: 'M14 3h7v7M21 3l-9 9M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5',
  settings: 'M3 6h18M3 12h18M3 18h18M8 3v6m8 0v6m-8 0v6',
  key: 'M11 12l8 8m-3-3 3-3m-6 0 3-3M12 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  file: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Zm0 0v6h6M8 13h8M8 17h5',
} as const;
export type IconName = keyof typeof paths;
export function Icon({
  name,
  ...props
}: Omit<ComponentProps<'svg'>, 'children'> & { name: IconName }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
      className={`dx-icon ${props.className ?? ''}`}
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
export function IconButton({
  label,
  icon,
  size = 'small',
  variant = 'ghost',
  className,
  ...props
}: Omit<ComponentProps<typeof Button>, 'children' | 'aria-label'> & {
  label: string;
  icon: IconName;
}) {
  return (
    <Button
      {...props}
      size={size}
      variant={variant}
      className={`dx-icon-button ${className ?? ''}`}
      aria-label={label}
      title={props.title ?? label}
    >
      <Icon name={icon} />
    </Button>
  );
}
