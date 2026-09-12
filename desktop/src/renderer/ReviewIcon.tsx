export type ReviewIconName =
  'shield' | 'plan' | 'browser' | 'file' | 'integration' | 'chevron' | 'arrow' | 'check';

export function ReviewIcon({ name }: { name: ReviewIconName }) {
  const paths: Record<ReviewIconName, string> = {
    shield: 'M12 3 4 6v5c0 5 8 10 8 10s8-5 8-10V6l-8-3Z M9 12l2 2 4-4',
    plan: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
    browser:
      'M3 8h18M7 5h.01M10 5h.01M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z',
    file: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Zm0 0v6h6M8 13h8M8 17h5',
    integration: 'M9 7H7a5 5 0 0 0 0 10h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8',
    chevron: 'm8 10 4 4 4-4',
    arrow: 'M4 12h16m-6-6 6 6-6 6',
    check: 'm5 12 4 4L19 6',
  };
  return (
    <svg
      className="review-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
