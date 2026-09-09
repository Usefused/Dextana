export type Reasoning = 'default' | 'off' | 'on' | 'low' | 'medium' | 'high' | 'max';
export type Theme = 'system' | 'light' | 'dark';
export interface Settings {
  provider?: 'ollama' | 'openai';
  connectionId?: string;
  hasApiKey?: boolean;
  ollamaUrl: string;
  models: string[];
  defaultModel?: string; // Legacy settings; ignored.
}
export interface FusedServer { id: string; mcpId: string; name: string; version: string; url: string }
export interface FusedWorkspace { url: string; connectedAt: string; servers: FusedServer[] }
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
  'starting' | 'running' | 'completed' | 'cancelled' | 'failed' | 'interrupted' | 'awaiting_plan';
export type ActivityMode = 'work' | 'plan';
export interface WorkPlan {
  id: string;
  messageId: string;
  title: string;
  steps: string[];
  status: 'proposed' | 'approved' | 'completed' | 'declined' | 'superseded' | 'interrupted' | 'stopped';
  createdAt: string;
  approvedAt?: string;
  scope: {
    browserOrigins: string[];
    files: { action: 'read' | 'create'; path: string; parentIdentity: string }[];
    mcpTools: { serverId: string; serverName: string; toolName: string; revision: string; fingerprint: string }[];
    fusedIntegrations: { id: string; name: string; revision: string }[];
  };
}
export interface Message {
  reasoning?: Reasoning;
  files?: string[];
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model: string;
  thought?: { text: string; steps?: string[]; durationMs: number; runningSince?: number };
}
export interface QueuedMessage {
  reasoning?: Reasoning;
  mode?: ActivityMode;
  files?: string[];
  id: string;
  prompt: string;
  model: string;
}
export interface ContextItem {
  id: string; kind: 'file' | 'url'; location: string; name: string;
  status: 'selected' | 'read' | 'created' | 'referenced' | 'visited';
}
export interface BrowserTab {
  id: string; activityId: string; url: string; title: string; needsReopen: boolean;
}
export interface BrowserPane {
  activityId: string; tabId: string; url: string; tabs: BrowserTab[]; busyTabIds: string[];
}
export interface Activity {
  provider?: 'ollama' | 'openai';
  connectionId?: string;
  modelSelection?: { model: string; reasoning: Reasoning };
  reasoning?: Reasoning;
  mode?: ActivityMode;
  turnMode?: ActivityMode;
  plans?: WorkPlan[];
  activePlanId?: string;
  planOwnerId?: string;
  allowAllApprovals?: boolean;
  browserTabsInitialized?: boolean;
  browser?: { url: string; needsReopen: boolean; saveError?: string; tabs?: BrowserTab[]; activeTabId?: string };
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
export interface CronJobInput { name: string; prompt: string; model: string; expression: string; timezone: string; enabled: boolean }
export interface CronJob extends CronJobInput { id: string; nextRunAt?: string; error?: string; runs: { id: string; startedAt: string; status?: string; activityId?: string; error?: string }[] }
export interface Snapshot {
  theme?: Theme;
  cronJobs?: CronJob[];
  cronError?: string;
  fusedWorkspace?: FusedWorkspace;
  fusedAccount?: FusedAccount;
  fusedIntegrations?: FusedIntegration[];
  mcpConnections?: MCPConnection[];
  folders?: ConversationFolder[];
  settings: Settings;
  activities: Activity[];
  fused: FusedSettings;
  browser?: BrowserPane;
}
export interface LoginConnection { id: string; code: string; origin: string; destination: string }
export interface FusedCLIInstallation { path: string; version: string; compatible: boolean; directory?: string }
export interface FusedCLIStatus {
  phase: 'idle' | 'checking' | 'downloading' | 'verifying' | 'installing' | 'ready' | 'error';
  recommendedVersion: string; supported: boolean; active?: 'existing' | 'managed';
  existing?: FusedCLIInstallation; managed?: FusedCLIInstallation;
  downloaded?: number; total?: number; error?: string; message?: string;
}
export interface DesktopAPI {
  fusedCLIStatus(): Promise<FusedCLIStatus>;
  checkFusedCLI(): Promise<FusedCLIStatus>;
  installFusedCLI(): Promise<FusedCLIStatus>;
  cancelFusedCLIInstall(): Promise<void>;
  chooseFusedCLI(): Promise<FusedCLIStatus>;
  useExistingFusedCLI(): Promise<FusedCLIStatus>;
  useManagedFusedCLI(): Promise<FusedCLIStatus>;
  copyText(text: string): Promise<void>;
  loadImage(url: string): Promise<string>;
  setTheme(theme: Theme): Promise<void>;
  saveCronJob(input: CronJobInput, id?: string): Promise<string>;
  removeCronJob(id: string): Promise<void>;
  runCronJob(id: string): Promise<void>;
  decidePlan(input: { activityId: string; planId: string; approved: boolean }): Promise<void>;
  resume(activityId: string): Promise<void>;
  steer(activityId: string, messageId: string): Promise<void>;
  copyLoginCode(id: string): Promise<void>;
  openLoginExtension(id: string): Promise<void>;
  onLoginOffer(callback: (tabId: string) => void): () => void;
  setSessionApprovals(activityId: string, allowAll: boolean): Promise<void>;
  onOpenSettings(listener: () => void): () => void;
  beginLoginTransfer(tabId: string): Promise<LoginConnection>;
  loginTransferStatus(id: string): Promise<{ state: 'waiting' | 'importing' | 'completed' | 'failed'; error: string }>;
  cancelLoginTransfer(id: string): Promise<void>;
  loginFused(url: string): Promise<void>;
  cancelFusedLogin(): Promise<void>;
  discoverFused(): Promise<void>;
  logoutFused(): Promise<void>;
  selectFusedServer(id: string, autoToken: boolean, operations: string[]): Promise<void>;
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
  skills(): Promise<PersonalSkill[]>;
  saveSkill(input: PersonalSkillInput): Promise<PersonalSkill>;
  deleteSkill(id: string): Promise<void>;
  importSkill(): Promise<PersonalSkillInput | null>;
  usage(period: '7d' | '30d' | 'all'): Promise<UsageSummary>;
  models(connection: string | Settings, apiKey?: string): Promise<string[]>;
  saveSettings(settings: Settings, apiKey?: string): Promise<void>;
  selectModel(activityId: string, model: string, reasoning: Reasoning): Promise<void>;
  modelReasoning(url: string, model: string): Promise<'none' | 'toggle' | 'levels' | 'extended'>;
  start(input: { reasoning?: Reasoning; mode?: ActivityMode; files?: string[]; prompt: string; model: string; activityId?: string; folderId?: string }): Promise<string>;
  cancel(id: string): Promise<void>;
  showBrowser(id: string, tabId?: string): Promise<void>;
  newBrowserTab(id: string, url: string): Promise<void>;
  refreshBrowserTab(tabId: string): Promise<void>;
  closeBrowserTab(tabId: string): Promise<void>;
  hideBrowser(): Promise<void>;
  resizeBrowser(width: number | undefined, dragging: boolean): Promise<void>;
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
  auth?: MCPAuth;
  fusedNative?: { engine: string; server: FusedServer; autoToken: boolean; operations: string[] };
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
  auth?: MCPAuth;
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
export type MCPAuth = { type: 'none' | 'bearer' } | { type: 'header' | 'body'; name: string };
declare global {
  interface Window {
    dextana: DesktopAPI;
  }
}

export interface PersonalSkillInput { id?: string; name: string; description: string; instructions: string; enabled: boolean }
export interface PersonalSkill extends PersonalSkillInput { id: string; version: string; updatedAt: string }
export interface UsageCounts { inputTokens: number; outputTokens: number; totalTokens: number; calls: number; reportedCalls: number }
export interface UsageSummary extends UsageCounts { period: string; models: (UsageCounts & { model: string; provider: string })[] }
