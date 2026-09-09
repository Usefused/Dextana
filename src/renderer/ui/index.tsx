import { createElement, useId, type ComponentProps, type ReactNode } from 'react';

const cx = (...names: (string | undefined | false)[]) => names.filter(Boolean).join(' ');
type Tone = 'neutral' | 'success' | 'warning' | 'danger';

export function Button({
  variant = 'secondary',
  size = 'medium',
  busy = false,
  type = 'button',
  className,
  disabled,
  children,
  icon,
  endIcon,
  ...props
}: ComponentProps<'button'> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'layout';
  size?: 'small' | 'medium';
  busy?: boolean;
  icon?: ReactNode;
  endIcon?: ReactNode;
}) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cx('dx-button', `dx-button--${variant}`, `dx-button--${size}`, className)}
    >
      {busy && <span className="dx-spinner" aria-hidden="true" />}
      {icon && (
        <span className="dx-button-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
      {endIcon && (
        <span className="dx-button-icon" aria-hidden="true">
          {endIcon}
        </span>
      )}
    </button>
  );
}

export function TextInput({
  className,
  compact,
  ...props
}: ComponentProps<'input'> & { compact?: boolean }) {
  return (
    <input
      {...props}
      data-autofocus={props.autoFocus || undefined}
      className={cx('dx-input', compact && 'dx-input--compact', className)}
    />
  );
}
export function TextArea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      {...props}
      data-autofocus={props.autoFocus || undefined}
      className={cx('dx-input', className)}
    />
  );
}
export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select {...props} className={cx('dx-input', className)} />;
}

export function RangeInput({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return <input {...props} type="range" className={cx('dx-range', className)} />;
}

/** Group a form with spacing, without adding a second box around its controls. */
export function FormSection({ className, ...props }: ComponentProps<'section'>) {
  return <section {...props} className={cx('dx-form-section', className)} />;
}

/** Render the control with these props so its label, hint and error stay connected. */
export function Field({
  label,
  hint,
  error,
  id: suppliedId,
  variant = 'plain',
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  id?: string;
  variant?: 'plain' | 'card';
  children: (props: {
    id: string;
    'aria-describedby'?: string;
    'aria-invalid'?: true;
  }) => ReactNode;
}) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  return (
    <div className={cx('dx-field', variant === 'card' && 'dx-field--card')}>
      <label htmlFor={id}>{label}</label>
      {children({
        id,
        'aria-describedby': hint || error ? `${id}-help` : undefined,
        'aria-invalid': error ? true : undefined,
      })}
      {(hint || error) && (
        <div
          id={`${id}-help`}
          className={cx('dx-field-help', error && 'dx-field-error')}
          role={error ? 'alert' : undefined}
        >
          {error || hint}
        </div>
      )}
    </div>
  );
}

export function Switch({ className, ...props }: Omit<ComponentProps<'input'>, 'type' | 'role'>) {
  return <input {...props} type="checkbox" role="switch" className={cx('dx-switch', className)} />;
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="dx-page-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="dx-actions">{actions}</div>}
    </div>
  );
}
export function SectionHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="dx-section-header">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="dx-actions">{actions}</div>}
    </div>
  );
}
export function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="dx-setting-row">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      <div className="dx-actions">{children}</div>
    </div>
  );
}
export function Card({
  as = 'section',
  className,
  ...props
}: ComponentProps<'section'> & {
  as?: 'section' | 'article' | 'aside' | 'div';
}) {
  return createElement(as, { ...props, className: cx('dx-card', className) });
}
export function Badge({
  tone = 'neutral',
  className,
  ...props
}: ComponentProps<'span'> & { tone?: Tone }) {
  return <span {...props} className={cx('dx-badge', `dx-tone--${tone}`, className)} />;
}
export function Notice({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx('dx-notice', `dx-tone--${tone}`, className)}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      {children}
    </div>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="dx-empty">
      <h2>{title}</h2>
      <p>{description}</p>
      {action && <div className="dx-actions">{action}</div>}
    </div>
  );
}

export { Icon, IconButton, type IconName } from './Icon';
export { Modal, Popover, DropdownMenu } from './overlays';
export { SearchSelect, type SelectOption } from './SearchSelect';
export {
  AgentPlan,
  BrowserTabs,
  BrowserToolbar,
  PermissionCard,
  PlanSteps,
  type PlanStep,
  ReviewCard,
  Tagline,
} from './patterns';

export function Checkbox({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return <input {...props} type="checkbox" className={cx('dx-checkbox', className)} />;
}
export function CheckboxField({
  label,
  description,
  className,
  ...props
}: Omit<ComponentProps<typeof Checkbox>, 'children'> & {
  label: ReactNode;
  description?: ReactNode;
}) {
  return (
    <label className={cx('dx-checkbox-field', className)}>
      <Checkbox {...props} />
      <span>
        <strong>{label}</strong>
        {description && <span className="dx-checkbox-description">{description}</span>}
      </span>
    </label>
  );
}
export function CheckboxCard({
  label,
  description,
  className,
  icon,
  actions,
  accessory,
  selection = 'checkbox',
  ...props
}: ComponentProps<typeof CheckboxField> & {
  icon?: ReactNode;
  actions?: ReactNode;
  accessory?: ReactNode;
  selection?: 'checkbox' | 'switch';
}) {
  const id = useId();
  const Control = selection === 'switch' ? Switch : Checkbox;
  return (
    <section
      className={cx('dx-checkbox-card', className)}
      aria-labelledby={`${id}-title`}
      data-disabled={props.disabled || undefined}
    >
      <label className="dx-checkbox-card-selection">
        {icon && (
          <span className="dx-checkbox-card-icon" aria-hidden="true">
            {icon}
          </span>
        )}
        <Control
          {...props}
          className={selection === 'switch' ? 'dx-card-switch' : undefined}
          aria-labelledby={
            props['aria-labelledby'] ?? (props['aria-label'] ? undefined : `${id}-title`)
          }
          aria-describedby={
            [props['aria-describedby'], description ? `${id}-description` : undefined]
              .filter(Boolean)
              .join(' ') || undefined
          }
        />
        <span className="dx-checkbox-card-copy">
          <strong id={`${id}-title`}>{label}</strong>
          {description && <span id={`${id}-description`}>{description}</span>}
        </span>
      </label>
      {(actions || accessory) && (
        <div className="dx-checkbox-card-footer">
          <div className="dx-actions">{actions}</div>
          {accessory}
        </div>
      )}
    </section>
  );
}
