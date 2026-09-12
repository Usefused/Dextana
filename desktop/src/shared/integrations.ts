export interface IntegrationProvider {
  id: string;
  name: string;
  operations: { id: string; name: string }[];
}
export interface IntegrationsCatalog {
  availability?: { subscribe: boolean; signIn: boolean };
  generatedAt: string;
  price: { amount: number; currency: string; interval: string };
  providers: IntegrationProvider[];
}
export interface IntegrationsAccount {
  username: string;
  email: string;
  subscribed: boolean;
  enabled: string[];
  identities: { id: string; label: string }[];
  providerAccounts: {
    id: string;
    identityId: string;
    provider: string;
    label: string;
    selected: boolean;
  }[];
  connected: boolean;
  revision: string;
  mcpUrl: string;
}
export interface IntegrationsView {
  configured: boolean;
  connected?: boolean;
  catalog?: IntegrationsCatalog;
  account?: IntegrationsAccount;
}
export type IntegrationsCommand =
  | { action: 'view' | 'logout' | 'checkout' | 'billing' | 'activate' }
  | { action: 'register'; username: string; email: string }
  | { action: 'login'; email: string }
  | { action: 'verify'; challengeId: string; code: string }
  | { action: 'connect'; provider: string; accountId?: string }
  | { action: 'add-account'; provider: string; label: string }
  | { action: 'select-account'; provider: string; accountId: string }
  | { action: 'enable'; provider: string; enabled: boolean };
export interface IntegrationsResult extends IntegrationsView {
  challengeId?: string;
}
