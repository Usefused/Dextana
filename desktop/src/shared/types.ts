import type { AppNotification, NotificationCommand } from './notifications';
import type { IntegrationsCommand, IntegrationsResult } from './integrations';
import type { UserBrowserState, UserBrowserPairing } from './user-browser';
import type { ComputerCommand, ComputerSnapshot } from './desktop-computer';
import type { DesktopAlarmSnapshot, DesktopTimeFilesRequest } from './desktop-time-files';
import type { DesktopWorkflowSnapshot } from './desktop-workflows';
import type { DesktopWork } from './desktop';
import type { ModelAuth } from './model-auth';
import type { TeachCommand, TeachResult, TeachSnapshot, TaughtSkill } from './teach-dex';
export type Reasoning =
  'default' | 'off' | 'on' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type ReasoningSupport =
  'none' | 'unknown' | 'toggle' | 'levels' | 'extended' | { kind: 'effort'; choices: Reasoning[] };
export type Theme = 'system' | 'light' | 'dark';
export interface ModelCatalog {
  chat: string[];
  embedding: string[];
  vision?: string[];
}

export interface Settings {
  provider?: 'ollama' | 'openai';
  connectionId?: string;
  hasApiKey?: boolean;
  authMode?: 'bearer' | 'custom';
  hasCustomAuth?: boolean;
  ollamaUrl: string;
  models: string[];
  embeddingModel?: string;
  imageInterpreterModel?: string;
  embeddingDimensions?: number;
  memoryError?: string;
  defaultModel?: string; // Legacy settings; ignored.
}
export interface FusedServer {
  id: string;
  mcpId: string;
  name: string;
  version: string;
  url: string;
}
export interface FusedWorkspace {
  url: string;
  connectedAt: string;
  /** Legacy location migrated to Snapshot.dextIdentityRef. */
  userRef?: string;
  servers: FusedServer[];
}
export interface MCPAuthentication {
  id: string;
  activityId: string;
  connectionId: string;
  connectionName: string;
  message: string;
  action: 'connect' | 'reconnect';
  state: 'waiting' | 'complete' | 'expired';
  retryAllowed: boolean;
  expiresAt: string;
}
export interface FusedAccount {
  url: string;
  secretId: string;
  connectedAt: string;
}
export interface FusedSettings {
  enabled: boolean;
  url: string;
  hasToken: boolean;
}
export interface FusedIntegration extends FusedSettings {
  managed?: 'dext';
  id: string;
  name: string;
  revision: string;
  secretId?: string;
}
export interface FusedInput {
  id?: string;
  name?: string;
  enabled: boolean;
  url: string;
  token: string;
}
export interface Approval {
  source?: 'harnest';
  id: string;
  capability: 'browser' | 'mcp' | 'fileRead' | 'fileCreate' | 'fileEdit' | 'desktop' | 'computer';
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
  status:
    'proposed' | 'approved' | 'completed' | 'declined' | 'superseded' | 'interrupted' | 'stopped';
  createdAt: string;
  approvedAt?: string;
  scope: {
    browserOrigins: string[];
    files: { action: 'read' | 'create'; path: string; parentIdentity: string }[];
    mcpTools: {
      serverId: string;
      serverName: string;
      toolName: string;
      revision: string;
      fingerprint: string;
    }[];
    fusedIntegrations: { id: string; name: string; revision: string }[];
  };
}
export interface Message {
  eventStart?: number;
  createdAt?: string;
  replyToMessageId?: string;
  editedAt?: string;
  generated?: boolean;
  mode?: ActivityMode;
  reminder?: { scheduleId: string; deliveredAt: string; overdue?: boolean; dueAt?: string };
  reasoning?: Reasoning;
  files?: string[];
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model: string;
  thought?: { text: string; steps?: string[]; durationMs: number; runningSince?: number };
}
export interface LiveQuestion {
  id: string;
  activityId: string;
  sourceTitle: string;
  form: unknown;
  status: 'pending' | 'answered' | 'cancelled';
  answer?: string;
}
export interface QueuedMessage {
  reasoning?: Reasoning;
  mode?: ActivityMode;
  files?: string[];
  id: string;
  prompt: string;
  model: string;
}
export type QueuedMessageUpdate = { activityId: string; messageId: string } & (
  { action: 'edit'; prompt: string } | { action: 'delete' }
);
export interface ContextItem {
  id: string;
  kind: 'file' | 'url' | 'desktop';
  location: string;
  name: string;
  desktop?: {
    work: DesktopWork;
    resourceId: string;
    operation: string;
    state?: string;
    path?: string;
  };
  status: 'selected' | 'read' | 'created' | 'edited' | 'referenced' | 'visited';
}
export interface BrowserTab {
  id: string;
  activityId: string;
  url: string;
  title: string;
  needsReopen: boolean;
}
/** File facts allowed in agent tool results. Routing metadata belongs to BrowserDownload. */
export interface BrowserDownloadReceipt {
  filename: string;
  state: 'progressing' | 'completed' | 'cancelled' | 'interrupted';
  receivedBytes: number;
  totalBytes: number;
  path?: string;
  message?: string;
}
/** Desktop controls need these identifiers; agent download results must use the receipt projection. */
export interface BrowserDownload extends BrowserDownloadReceipt {
  id: string;
  activityId: string;
  tabId: string;
}
export interface BrowserPane {
  ephemeral?: boolean;
  activityId: string;
  tabId: string;
  url: string;
  tabs: BrowserTab[];
  busyTabIds: string[];
  downloads?: BrowserDownload[];
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
  browserChoice?: { surface: 'user' | 'in-app'; afterMessageId?: string };
  browser?: {
    url: string;
    needsReopen: boolean;
    saveError?: string;
    tabs?: BrowserTab[];
    activeTabId?: string;
  };
  context?: ContextItem[];
  folderId?: string;
  permissions?: {
    browser?: boolean;
    mcp?: boolean;
    fileRead?: boolean;
    fileCreate?: boolean;
    desktop?: boolean;
    computer?: boolean;
  };
  archived?: boolean;
  queue?: QueuedMessage[];
  id: string;
  title: string;
  model: string;
  ollamaUrl: string;
  status: ActivityStatus;
  messages: Message[];
  events: string[];
  compacting?: boolean;
  error?: string;
  runtimeSessionId?: string;
  approval?: Approval;
  parentId?: string;
  questions?: LiveQuestion[];
}
export interface ConversationFolder {
  id: string;
  name: string;
  collapsed?: boolean;
}
export interface CronJobInput {
  name: string;
  prompt: string;
  model: string;
  expression: string;
  timezone: string;
  enabled: boolean;
  runAt?: string | null;
  kind?: 'task' | 'reminder';
}
export interface CronJob extends CronJobInput {
  id: string;
  nextRunAt?: string;
  error?: string;
  runs: { id: string; startedAt: string; status?: string; activityId?: string; error?: string }[];
}
export interface Snapshot {
  /** Stable, opaque installation identity used to select provider grants across Fused MCPs. */
  dextIdentityRef?: string;
  teaching?: TeachSnapshot;
  notifications?: AppNotification[];
  userBrowsers?: UserBrowserState[];
  desktopComputer?: ComputerSnapshot;
  desktopAlarms?: DesktopAlarmSnapshot;
  desktopWorkflows?: DesktopWorkflowSnapshot;
  desktopBackground?: boolean;
  browserPreferences?: { autoAllow: boolean };
  desktopError?: string;
  theme?: Theme;
  cronJobs?: CronJob[];
  cronError?: string;
  fusedWorkspace?: FusedWorkspace;
  fusedAccount?: FusedAccount;
  fusedIntegrations?: FusedIntegration[];
  mcpConnections?: MCPConnection[];
  /** Ephemeral prompts only. Authorization URLs and provider credentials are never included. */
  mcpAuthentications?: MCPAuthentication[];
  folders?: ConversationFolder[];
  settings: Settings;
  activities: Activity[];
  fused: FusedSettings;
  browser?: BrowserPane;
}
export interface LoginConnection {
  id: string;
  code: string;
  origin: string;
  destination: string;
}
export interface FusedCLIInstallation {
  path: string;
  version: string;
  compatible: boolean;
  directory?: string;
}
export interface FusedCLIStatus {
  phase: 'idle' | 'checking' | 'downloading' | 'verifying' | 'installing' | 'ready' | 'error';
  recommendedVersion: string;
  supported: boolean;
  active?: 'existing' | 'managed';
  existing?: FusedCLIInstallation;
  managed?: FusedCLIInstallation;
  downloaded?: number;
  total?: number;
  error?: string;
  message?: string;
}
export interface DesktopAPI {
  teach(command: TeachCommand): Promise<TeachResult>;
  taughtSkills(): Promise<TaughtSkill[]>;
  notification(command: NotificationCommand): Promise<void>;
  onOpenNotifications(callback: () => void): () => void;
  integrations(input: IntegrationsCommand): Promise<IntegrationsResult>;
  beginUserBrowser(activityId: string): Promise<UserBrowserPairing | undefined>;
  userBrowserPairing(activityId: string): Promise<UserBrowserPairing | undefined>;
  stopUserBrowser(activityId: string): Promise<void>;
  resetUserBrowser(activityId: string): Promise<void>;
  openBrowserExtension(): Promise<void>;
  desktopComputer(request: ComputerCommand): Promise<ComputerSnapshot>;
  desktopAlarm(request: DesktopTimeFilesRequest): Promise<unknown>;
  desktopWorkflow(
    operation: string,
    args: Record<string, unknown>,
    activityId: string,
  ): Promise<unknown>;
  setDesktopBackground(enabled: boolean): Promise<void>;
  setBrowserPreferences(input: { autoAllow: boolean }): Promise<void>;
  openDesktopContext(activityId: string, itemId: string): Promise<void>;
  onOpenDesktop(callback: (resourceId?: string) => void): () => void;
  openFile(activityId: string, itemId: string): Promise<unknown>;
  onOpenActivity(callback: (activityId: string) => void): () => void;
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
  editMessage(input: { activityId: string; messageId: string; prompt: string }): Promise<string>;
  updateQueuedMessage(input: QueuedMessageUpdate): Promise<void>;
  answerQuestions(input: { activityId: string; questionId: string; prompt: string }): Promise<void>;
  copyLoginCode(id: string): Promise<void>;
  openLoginExtension(id: string): Promise<void>;
  onLoginOffer(callback: (tabId: string) => void): () => void;
  setSessionApprovals(activityId: string, allowAll: boolean): Promise<void>;
  onOpenSettings(listener: (page?: 'computer') => void): () => void;
  beginLoginTransfer(tabId: string): Promise<LoginConnection>;
  loginTransferStatus(
    id: string,
  ): Promise<{ state: 'waiting' | 'importing' | 'completed' | 'failed'; error: string }>;
  cancelLoginTransfer(id: string): Promise<void>;
  loginFused(url: string): Promise<void>;
  cancelFusedLogin(): Promise<void>;
  fusedOperations(id: string): Promise<string[]>;
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
  openMCPAuthentication(id: string, surface: 'in-app' | 'user'): Promise<void>;
  dismissMCPAuthentication(id: string): Promise<void>;
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
  modelCatalog(
    connection: string | Settings,
    apiKey?: string,
    auth?: ModelAuth,
  ): Promise<ModelCatalog>;
  saveSettings(settings: Settings, apiKey?: string, auth?: ModelAuth): Promise<void>;
  selectModel(activityId: string, model: string, reasoning: Reasoning): Promise<void>;
  modelReasoning(url: string, model: string): Promise<ReasoningSupport>;
  start(input: {
    reasoning?: Reasoning;
    mode?: ActivityMode;
    files?: string[];
    prompt: string;
    model: string;
    activityId?: string;
    folderId?: string;
    replyToMessageId?: string;
  }): Promise<string>;
  cancel(id: string): Promise<void>;
  showBrowser(id: string, tabId?: string): Promise<void>;
  newBrowserTab(id: string, url: string): Promise<void>;
  refreshBrowserTab(tabId: string): Promise<void>;
  browserDownload(id: string, action: 'cancel' | 'reveal'): Promise<void>;
  closeBrowserTab(tabId: string): Promise<void>;
  hideBrowser(): Promise<void>;
  setBrowserOverlay(visible: boolean): Promise<void>;
  resizeBrowser(width: number | undefined, dragging: boolean): Promise<void>;
  selectActivity(id?: string): Promise<void>;
  saveFusedAccount(input: { url: string; licenseKey: string }): Promise<void>;
  removeFusedAccount(): Promise<void>;
  saveFused(input: FusedInput): Promise<string>;
  removeFused(id: string): Promise<void>;
  approve(input: {
    activityId: string;
    approvalId: string;
    approved: boolean;
    autoAllow?: boolean;
  }): Promise<void>;
  setPermission(
    input:
      | { activityId: string; capability: 'browser'; autoAllow: boolean | null }
      | {
          activityId: string;
          capability: 'mcp' | 'fileRead' | 'fileCreate' | 'desktop' | 'computer';
          autoAllow: boolean;
        },
  ): Promise<void>;
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
  customAuth?: { headers: Record<string, string>; body: Record<string, unknown> };
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
export type MCPAuth =
  { type: 'none' | 'bearer' | 'custom' } | { type: 'header' | 'body'; name: string };
declare global {
  interface Window {
    dextana: DesktopAPI;
  }
}

export interface PersonalSkillInput {
  id?: string;
  name: string;
  description: string;
  instructions: string;
  enabled: boolean;
}
export interface PersonalSkill extends PersonalSkillInput {
  id: string;
  version: string;
  updatedAt: string;
}
export interface UsageCounts {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  calls: number;
  reportedCalls: number;
}
export interface UsageSummary extends UsageCounts {
  period: string;
  models: (UsageCounts & { model: string; provider: string })[];
}
