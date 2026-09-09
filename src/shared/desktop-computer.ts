export interface ComputerWindow {
  id: string;
  pid: number;
  windowId: number;
  application: string;
  title: string;
}
export interface ComputerSelection {
  id: string;
  activityId: string;
  window: ComputerWindow;
  state: 'ready' | 'working' | 'stopped';
}
export interface ComputerSnapshot {
  enabled: boolean;
  permissions?: { accessibility: boolean; screenRecording: boolean };
  selection?: ComputerSelection;
  error?: string;
}
export type ComputerCommand =
  | { action: 'enable' | 'permissions' | 'windows' | 'stop' | 'disable' }
  | { action: 'select'; windowId: string; activityId: string };
