import { Popover, Switch } from './ui';
import { type ReactNode } from 'react';
import type { Activity } from '../shared/types';
import { BrowserApprovalSelect } from './BrowserApprovalSelect';
import { SessionApprovals } from './ActionApproval';

export function SessionSettings({
  activity,
  browserAutoAllow,
  showContext,
  toggleContext,
  folderControl,
  browserControl,
}: {
  activity: Activity;
  browserAutoAllow: boolean;
  showContext: boolean;
  toggleContext: () => void;
  folderControl: ReactNode;
  browserControl: (close: () => void) => ReactNode;
}) {
  return (
    <Popover label="Chat settings" icon="settings" iconOnly className="dx-session-popover">
      {(close) => (
        <>
          <h2>Chat settings</h2>
          <div className="chat-settings-label settings-option-label">
            <svg
              width="15"
              height="15"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m10 2 6 2.5V10c0 3.5-6 7-6 7s-6-3.5-6-7V4.5L10 2Z" />
              <path d="m7 9 2 2 4-4" />
            </svg>
            Approvals
          </div>
          <SessionApprovals activity={activity} />
          <BrowserApprovalSelect activity={activity} defaultAutoAllow={browserAutoAllow} />
          <div className="chat-browser-setting">
            <span className="settings-option-label">
              <svg
                width="15"
                height="15"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
                <path d="M3 7h14" />
                <circle cx="5" cy="5.3" r=".6" fill="currentColor" stroke="none" />
              </svg>
              Browser
            </span>
            {browserControl(close)}
          </div>
          <label className="chat-context-switch">
            <span className="settings-option-label">
              <svg
                width="15"
                height="15"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
                <path d="M12 4v12M5.5 7h3M5.5 10h3" />
              </svg>
              Show context
            </span>
            <Switch
              checked={showContext}
              onChange={toggleContext}
              aria-controls="session-context"
            />
          </label>
          <div className="chat-settings-folder">
            <span className="settings-option-label">
              <svg
                width="15"
                height="15"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M2.5 6V4.5h5l2 2h8v9a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1V6Z" />
                <path d="M7 11h6m-2-2 2 2-2 2" />
              </svg>
              Move to folder
            </span>
            {folderControl}
          </div>
        </>
      )}
    </Popover>
  );
}
