export interface ComputerActivity {
  id: string;
  activityId: string;
  state: 'ready' | 'working' | 'stopped';
}
export interface ComputerSnapshot {
  enabled: boolean;
  permissions?: { accessibility: boolean; screenRecording: boolean };
  active?: ComputerActivity;
  error?: string;
}
export type ComputerCommand = {
  action:
    | 'enable'
    | 'permissions'
    | 'open-accessibility-settings'
    | 'open-screen-recording-settings'
    | 'stop'
    | 'disable';
};
