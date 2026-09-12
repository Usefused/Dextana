import { useEffect } from 'react';
import type { Snapshot } from '../shared/types';
import { Button, Icon, IconButton, Notice, PageHeader } from './ui';
import { DesktopTimers } from './DesktopTimers';
import { DesktopWorkflowsPanel } from './DesktopWorkflowsPanel';
import './desktop-workspace.css';

export type DesktopView = 'time' | 'workflows';

export function DesktopWorkspace({
  snapshot,
  focusedResource,
  openActivity,
  close,
  view,
  setView,
}: {
  view: DesktopView;
  setView: (view: DesktopView) => void;
  close: () => void;
  snapshot: Snapshot;
  focusedResource?: string;
  openActivity: (id: string) => void;
}) {
  useEffect(() => {
    if (!focusedResource) return;
    setView(
      snapshot.desktopAlarms?.alarms.some((alarm) => alarm.id === focusedResource)
        ? 'time'
        : 'workflows',
    );
  }, [focusedResource]);
  useEffect(() => {
    if (!focusedResource) return;
    const target = [...document.querySelectorAll<HTMLElement>('[data-desktop-resource]')].find(
      (element) => element.dataset.desktopResource === focusedResource,
    );
    if (target) {
      target.tabIndex = -1;
      target.scrollIntoView({ block: 'nearest' });
      target.focus();
    }
  }, [focusedResource, view]);
  return (
    <div className="desktop-workspace">
      <div className="desktop-workspace-content">
        <PageHeader
          title="Desktop"
          description="Your reminders and local work, close at hand."
          actions={<IconButton icon="close" label="Close Desktop" onClick={close} />}
        />
        <nav className="desktop-view-navigation" aria-label="Desktop views">
          <Button
            variant={view === 'time' ? 'primary' : 'secondary'}
            aria-pressed={view === 'time'}
            onClick={() => setView('time')}
          >
            Timers and reminders
          </Button>
          <Button
            variant={view === 'workflows' ? 'primary' : 'secondary'}
            aria-pressed={view === 'workflows'}
            icon={<Icon name="desktop" />}
            onClick={() => setView('workflows')}
          >
            Workflows
          </Button>
        </nav>
        {snapshot.desktopError && <Notice tone="danger">{snapshot.desktopError}</Notice>}
        {view === 'time' && snapshot.desktopAlarms && (
          <DesktopTimers
            snapshot={snapshot.desktopAlarms}
            selectedResourceId={focusedResource}
            onAction={(request) => window.dextana.desktopAlarm(request)}
            onOpenActivity={openActivity}
          />
        )}
        {view === 'workflows' && snapshot.desktopWorkflows && (
          <DesktopWorkflowsPanel
            snapshot={snapshot.desktopWorkflows}
            onAction={(operation, args, activityId) =>
              window.dextana.desktopWorkflow(operation, args, activityId)
            }
            onOpenActivity={openActivity}
          />
        )}
      </div>
    </div>
  );
}
