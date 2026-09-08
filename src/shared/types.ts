export interface Settings {
  ollamaUrl: string;
  models: string[];
  defaultModel: string;
}
export interface FusedAccount { url: string; secretId: string; connectedAt: string }
export interface FusedSettings {
  enabled: boolean;
  url: string;
  hasToken: boolean;
}
export interface FusedIntegration extends FusedSettings { id: string; name: string; revision: string; secretId?: string }
export interface FusedInput { id?: string; name?: string; enabled: boolean; url: string; token: string }
export interface Approval {
  source?: 'harnest';
  id: string;
  capability: 'browser' | 'mcp' | 'fileRead' | 'fileCreate';
  description: string;
  arguments: string;
}
export type ActivityStatus =
  'starting' | 'running' | 'completed' | 'cancelled' | 'failed' | 'interrupted';
export interface Message {
  files?: string[];
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model: string;
  thought?: { text: string; steps?: string[]; durationMs: number; runningSince?: number };
}
export interface QueuedMessage {
  files?: string[];
  id: string;
  prompt: string;
  model: string;
}
export interface ContextItem {
  id: string; kind: 'file' | 'url'; location: string; name: string;
  status: 'selected' | 'read' | 'created' | 'referenced' | 'visited';
}
export interface Activity {
  browser?: { url: string; needsReopen: boolean; saveError?: string };
  context?: ContextItem[];
  folderId?: string;
  permissions?: { browser?: boolean; mcp?: boolean; fileRead?: boolean; fileCreate?: boolean };
  archived?: boolean;
  queue?: QueuedMessage[];
  id: string;
  title: string;
  model: string;
  ollamaUrl: string;
  status: ActivityStatus;
  messages: Message[];
  events: string[];
  error?: string;
  runtimeSessionId?: string;
  approval?: Approval;
  parentId?: string;
}
export interface ConversationFolder { id: string; name: string; collapsed?: boolean }
export interface Snapshot {
  fusedAccount?: FusedAccount;
  fusedIntegrations?: FusedIntegration[];
  mcpConnections?: MCPConnection[];
  folders?: ConversationFolder[];
  settings: Settings;
  activities: Activity[];
  fused: FusedSettings;
  browser?: { activityId: string; url: string };
}
export interface DesktopAPI {
  attachContext(activityId: string, paths: string[]): Promise<void>;
  pickFiles(): Promise<string[]>;
  revealFile(activityId: string, itemId: string): Promise<void>;
  saveMCP(input: MCPConnectionInput): Promise<string>;
  testMCP(id: string): Promise<void>;
  setMCPTools(id: string, policies: Record<string, MCPToolPolicy>): Promise<void>;
  removeMCP(id: string): Promise<void>;
  createFolder(name: string): Promise<string>;
  updateFolder(id: string, changes: { name?: string; collapsed?: boolean }): Promise<void>;
  deleteFolder(id: string): Promise<void>;
  moveActivity(activityId: string, folderId: string | null): Promise<void>;
  archiveActivity(id: string, archived: boolean): Promise<void>;
  openLink(url: string): Promise<void>;
  snapshot(): Promise<Snapshot>;
  models(url: string): Promise<string[]>;
  saveSettings(settings: Settings): Promise<void>;
  start(input: { files?: string[]; prompt: string; model: string; activityId?: string; folderId?: string }): Promise<string>;
  cancel(id: string): Promise<void>;
  showBrowser(id: string): Promise<void>;
  hideBrowser(): Promise<void>;
  selectActivity(id?: string): Promise<void>;
  saveFusedAccount(input: { url: string; licenseKey: string }): Promise<void>;
  removeFusedAccount(): Promise<void>;
  saveFused(input: FusedInput): Promise<string>;
  removeFused(id: string): Promise<void>;
  approve(input: { activityId: string; approvalId: string; approved: boolean; autoAllow?: boolean }): Promise<void>;
  setPermission(input: { activityId: string; capability: 'browser' | 'mcp' | 'fileRead' | 'fileCreate'; autoAllow: boolean }): Promise<void>;
  subscribe(callback: (snapshot: Snapshot) => void): () => void;
}
export type MCPToolPolicy = 'disabled' | 'ask' | 'auto';
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  fingerprint: string;
  policy: MCPToolPolicy;
}
export interface MCPConnection {
  id: string;
  name: string;
  transport: 'http' | 'stdio';
  url: string;
  command: string;
  args: string[];
  enabled: boolean;
  secretId?: string;
  revision: string;
  testedAt?: string;
  tools: MCPTool[];
}
export interface MCPConnectionInput {
  id?: string;
  name: string;
  transport: 'http' | 'stdio';
  url: string;
  command: string;
  args: string[];
  enabled: boolean;
  token?: string;
  environment?: Record<string, string>;
}
declare global {
  interface Window {
    dextana: DesktopAPI;
  }
}
