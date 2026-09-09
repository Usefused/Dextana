import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './index';
import { Icon, IconButton, type IconName } from './Icon';

let openOverlays = 0;
function useBrowserOverlay(open: boolean) {
  useLayoutEffect(() => {
    if (!open) return;
    if (++openOverlays === 1) void window.dextana.setBrowserOverlay?.(true);
    return () => {
      if (--openOverlays === 0) void window.dextana.setBrowserOverlay?.(false);
    };
  }, [open]);
}

export function Modal({
  open = true,
  title,
  closeLabel = 'Close dialog',
  description,
  eyebrow,
  busy = false,
  wide = false,
  className = '',
  close,
  children,
  actions,
}: {
  open?: boolean;
  title: string;
  closeLabel?: string;
  description?: string;
  eyebrow?: string;
  busy?: boolean;
  wide?: boolean;
  className?: string;
  close: () => void;
  children: ReactNode;
  actions?: ReactNode;
}) {
  useBrowserOverlay(open);
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useLayoutEffect(() => {
    const dialog = ref.current!;
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    dialog.querySelector<HTMLElement>('[data-autofocus], [autofocus]')?.focus();
    return () => {
      dialog.close();
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);
  return createPortal(
    <dialog
      ref={ref}
      className={`dx-modal ${wide ? 'dx-modal--wide' : ''} ${className}`}
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-description` : undefined}
      aria-busy={busy || undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close();
      }}
      onClick={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          !busy &&
          event.target === event.currentTarget &&
          (event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom)
        )
          close();
      }}
    >
      <div className="dx-modal-heading">
        <div>
          {eyebrow && <span className="dx-tagline">{eyebrow}</span>}
          <h2 id={`${id}-title`}>{title}</h2>
        </div>
        <IconButton label={closeLabel} icon="close" disabled={busy} onClick={close} />
      </div>
      {description && (
        <p className="dx-modal-description" id={`${id}-description`}>
          {description}
        </p>
      )}
      <div className="dx-modal-body">{children}</div>
      {actions && <div className="dx-modal-actions">{actions}</div>}
    </dialog>,
    document.body,
  );
}

/** Native popovers supply top-layer rendering and Escape/outside-click dismissal. */
export function Popover({
  label,
  trigger,
  children,
  icon,
  disabled,
  menu = false,
  iconOnly = false,
  className = '',
  triggerClassName,
  containInChat = false,
}: {
  label: string;
  trigger?: ReactNode;
  icon?: IconName;
  disabled?: boolean;
  menu?: boolean;
  iconOnly?: boolean;
  className?: string;
  triggerClassName?: string;
  containInChat?: boolean;
  children: ReactNode | ((close: () => void) => ReactNode);
}) {
  const anchor = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const [open, setOpen] = useState(false);
  useBrowserOverlay(open && !containInChat);
  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const box = anchor.current!.getBoundingClientRect();
      const popup = panel.current!;
      const chat = containInChat ? anchor.current?.closest('main')?.getBoundingClientRect() : undefined;
      const left = (chat?.left ?? 0) + 12;
      const right = (chat?.right ?? window.innerWidth) - 12;
      popup.style.maxWidth = `${Math.max(0, right - left)}px`;
      const height = popup.offsetHeight;
      popup.style.left = `${Math.max(left, Math.min(box.left, right - popup.offsetWidth))}px`;
      popup.style.top = `${Math.max(12, box.bottom + height + 8 < window.innerHeight ? box.bottom + 8 : box.top - height - 8)}px`;
    };
    position();
    panel.current
      ?.querySelector<HTMLElement>(
        '[autofocus], button:not(:disabled), input:not(:disabled), select:not(:disabled)',
      )
      ?.focus();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    const focusOutside = (event: FocusEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !anchor.current?.contains(target))
        panel.current?.hidePopover();
    };
    document.addEventListener('focusin', focusOutside);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      document.removeEventListener('focusin', focusOutside);
    };
  }, [open]);
  const close = () => {
    panel.current?.hidePopover();
    anchor.current?.focus();
  };
  return (
    <>
      <Button
        ref={anchor}
        className={triggerClassName}
        variant={iconOnly ? 'ghost' : 'secondary'}
        size="small"
        disabled={disabled}
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup={menu ? 'menu' : 'dialog'}
        onClick={() => panel.current?.togglePopover()}
      >
        {icon && <Icon name={icon} />}
        {!iconOnly && (trigger ?? label)}
        {!iconOnly && <Icon name="chevron" />}
      </Button>
      {createPortal(
        <div
          ref={panel}
          id={id}
          popover="auto"
          data-overlay-root
          data-contained-chat={containInChat || undefined}
          role={menu ? 'menu' : 'dialog'}
          aria-label={label}
          className={`dx-popover ${menu ? 'dx-menu' : ''} ${className}`}
          onToggle={(event) => {
            const expanded = event.newState === 'open';
            setOpen(expanded);
            if (!expanded && panel.current?.contains(document.activeElement))
              anchor.current?.focus();
          }}
          onKeyDown={(event) => {
            if (!menu || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const items = [
              ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                '[role=menuitem]:not(:disabled)',
              ),
            ];
            const index = items.indexOf(document.activeElement as HTMLButtonElement);
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? items.length - 1
                  : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
            items[next]?.focus();
          }}
        >
          {typeof children === 'function' ? children(close) : children}
        </div>,
        anchor.current?.closest('dialog') ?? document.body,
      )}
    </>
  );
}
export function DropdownMenu({
  label,
  icon,
  items,
}: {
  label: string;
  icon?: IconName;
  items: {
    label: string;
    icon?: IconName;
    disabled?: boolean;
    danger?: boolean;
    action: () => void;
  }[];
}) {
  return (
    <Popover label={label} icon={icon} menu>
      {(close) =>
        items.map((item) => (
          <Button
            key={item.label}
            role="menuitem"
            variant={item.danger ? 'danger' : 'ghost'}
            disabled={item.disabled}
            onClick={() => {
              close();
              item.action();
            }}
          >
            {item.icon && <Icon name={item.icon} />}
            {item.label}
          </Button>
        ))
      }
    </Popover>
  );
}
