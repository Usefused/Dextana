export type DesktopWork = 'time' | 'files' | 'workflows' | 'processing' | 'device' | 'computer';
export interface DesktopOperation {
  name: string;
  work: DesktopWork;
  description: string;
  inputSchema: Record<string, unknown>;
  mutates: boolean;
}
export interface DesktopRequest {
  action: 'discover' | 'call';
  work?: DesktopWork;
  operation?: string;
  arguments_json?: string;
}
export interface DesktopContext {
  activityId: string;
}
export interface DesktopProvider {
  operations(): DesktopOperation[];
  release?(activityId: string): void;
  preview?(
    operation: string,
    args: Record<string, unknown>,
    context: DesktopContext,
  ): Promise<unknown>;
  execute(
    operation: string,
    args: Record<string, unknown>,
    context: DesktopContext,
    signal: AbortSignal,
  ): Promise<unknown>;
}
