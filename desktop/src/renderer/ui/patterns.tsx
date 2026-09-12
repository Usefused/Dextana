import { useEffect, useRef, type ComponentProps, type ReactNode } from 'react';
import { Badge, Button, TextInput } from './index';
import { Icon, IconButton, type IconName } from './Icon';

export function Tagline({ children, className = '', ...props }: ComponentProps<'p'>) {
  return (
    <p {...props} className={`dx-tagline ${className}`}>
      {children}
    </p>
  );
}

export function ReviewCard({
  eyebrow,
  icon,
  badge,
  title,
  description,
  children,
  actions,
  footer,
  className = '',
  ...props
}: Omit<ComponentProps<'section'>, 'title'> & {
  eyebrow: string;
  icon: IconName;
  badge?: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section {...props} className={`review-card ${className}`}>
      <div className="review-card-header">
        <span className="review-emblem">
          <Icon name={icon} />
        </span>
        <h2 className="review-eyebrow">{eyebrow}</h2>
        {badge && <div className="dx-review-badge">{badge}</div>}
      </div>
      <div className="review-card-body">
        <h3 className="review-title">{title}</h3>
        {description && <p className="review-description">{description}</p>}
        {children}
      </div>
      {(actions || footer) && (
        <footer className="review-card-footer">
          {actions && <div className="review-actions">{actions}</div>}
          {footer}
        </footer>
      )}
    </section>
  );
}

export function PermissionCard({
  kind,
  title,
  description,
  children,
  actions,
  footer,
  busy,
  ...props
}: Omit<ComponentProps<typeof ReviewCard>, 'eyebrow' | 'icon' | 'badge'> & {
  kind: string;
  busy?: boolean;
}) {
  return (
    <ReviewCard
      {...props}
      eyebrow="Permission needed"
      icon="shield"
      badge={<Badge tone="warning">{kind}</Badge>}
      title={title}
      description={description}
      aria-busy={busy || undefined}
      actions={actions}
      footer={footer}
    >
      {children}
    </ReviewCard>
  );
}

export type PlanStep = {
  title: string;
  description?: string;
  icon?: IconName;
  status?: 'pending' | 'running' | 'completed' | 'error';
};

const stepStatusLabels = {
  pending: 'Pending',
  running: 'In progress',
  completed: 'Completed',
  error: 'Needs attention',
};

export function PlanSteps({
  steps,
  detail = 'Included in this plan',
}: {
  steps: readonly (string | PlanStep)[];
  detail?: string;
}) {
  return (
    <ol className="work-plan-steps" aria-label="Plan steps">
      {steps.map((value, index) => {
        const step = typeof value === 'string' ? { title: value } : value;
        return (
          <li key={index}>
            <span className="work-plan-step-icon" aria-hidden="true">
              <Icon name={step.icon ?? 'plan'} />
            </span>
            <span className="work-plan-step-copy">
              <strong>{step.title}</strong>
              <span>{step.description ?? `Step ${index + 1} · ${detail}`}</span>
            </span>
            <span
              className="work-plan-step-dot"
              data-status={step.status}
              role={step.status ? 'img' : undefined}
              aria-label={step.status ? stepStatusLabels[step.status] : undefined}
              aria-hidden={step.status ? undefined : true}
              title={step.status ? stepStatusLabels[step.status] : undefined}
            />
          </li>
        );
      })}
    </ol>
  );
}

export function AgentPlan({
  title,
  status,
  statusLabel,
  steps,
  permissions,
  actions,
  footer,
  receipt,
  busy,
  error,
}: {
  title: string;
  status: string;
  statusLabel: string;
  steps: readonly (string | PlanStep)[];
  permissions?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  receipt?: ReactNode;
  busy?: boolean;
  error?: ReactNode;
}) {
  return (
    <ReviewCard
      className="work-plan"
      role="region"
      aria-label="Work plan"
      data-status={status}
      aria-busy={busy || undefined}
      eyebrow="Work plan"
      icon="plan"
      badge={
        <Badge
          className="work-plan-status"
          tone={
            status === 'proposed'
              ? 'warning'
              : ['approved', 'completed'].includes(status)
                ? 'success'
                : 'neutral'
          }
        >
          {statusLabel}
        </Badge>
      }
      title={title}
      description={`${steps.length} ${steps.length === 1 ? 'step' : 'steps'}${status === 'proposed' ? ' · Review before Dext gets started' : ' in this plan'}`}
      actions={actions}
      footer={
        footer || receipt || error ? (
          <>
            {footer}
            {receipt && (
              <p className="work-plan-receipt">
                <Icon name="check" />
                {receipt}
              </p>
            )}
            {error}
          </>
        ) : undefined
      }
    >
      <PlanSteps
        steps={steps}
        detail={status === 'proposed' ? 'Awaiting your review' : 'Included in this plan'}
      />
      {permissions}
    </ReviewCard>
  );
}

export function BrowserToolbar({
  url,
  refresh,
  disabled,
  actions,
}: {
  url: string;
  refresh: () => void;
  disabled?: boolean;
  actions?: ReactNode;
}) {
  return (
    <div className="browser-address-bar dx-browser-toolbar">
      <Icon name="browser" />
      <TextInput aria-label="Activity browser address" readOnly value={url} />
      <IconButton label="Refresh page" icon="refresh" disabled={disabled} onClick={refresh} />
      {actions}
    </div>
  );
}

export type BrowserTabItem = {
  id: string;
  title: string;
  label?: string;
  tooltip?: string;
  busy?: boolean;
};
export function BrowserTabs({
  tabs,
  selectedId,
  select,
  close,
  disabled,
}: {
  tabs: BrowserTabItem[];
  selectedId: string;
  select: (id: string) => void;
  close: (id: string) => void;
  disabled?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    root.current
      ?.querySelector('[aria-selected=true]')
      ?.closest('.browser-tab')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selectedId]);
  return (
    <div
      ref={root}
      className="browser-tabs dx-browser-tabs"
      role="tablist"
      aria-label="Browser tabs"
      onKeyDown={(event) => {
        if (
          (event.target as HTMLElement).getAttribute('role') !== 'tab' ||
          !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
        )
          return;
        event.preventDefault();
        const index = tabs.findIndex((tab) => tab.id === selectedId);
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        if (tabs[next]) {
          select(tabs[next].id);
          root.current?.querySelectorAll<HTMLButtonElement>('[role=tab]')[next]?.focus();
        }
      }}
    >
      {tabs.map((tab) => (
        <div className={`browser-tab ${selectedId === tab.id ? 'selected' : ''}`} key={tab.id}>
          <Button
            variant="layout"
            role="tab"
            tabIndex={selectedId === tab.id ? 0 : -1}
            aria-selected={selectedId === tab.id}
            aria-label={tab.label ?? tab.title}
            title={tab.tooltip ?? tab.title}
            onClick={() => select(tab.id)}
          >
            <span>
              {tab.busy ? '◌ ' : ''}
              {tab.title}
            </span>
          </Button>
          <IconButton
            label={`Close tab ${tab.title}`}
            icon="close"
            disabled={disabled || tab.busy}
            onClick={() => close(tab.id)}
          />
        </div>
      ))}
    </div>
  );
}
