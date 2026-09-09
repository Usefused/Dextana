import type { ReactNode } from 'react';
import { Modal } from './ui';

export function MCPDialog({
  title,
  wide,
  busy,
  close,
  children,
}: {
  title: string;
  wide?: boolean;
  busy?: boolean;
  close: () => void;
  children: ReactNode;
}) {
  return (
    <Modal
      title={title}
      wide={wide}
      busy={busy}
      close={close}
      className="mcp-modal"
      eyebrow={wide ? '02 / TOOLS' : '01 / CONNECT'}
    >
      {children}
    </Modal>
  );
}
