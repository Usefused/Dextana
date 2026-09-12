import { test } from './fixture';
import { recoverTogether } from './recovery';
import { cards } from './scenarios/a2ui';
import { conversation } from './scenarios/activities';
import { archives } from './scenarios/archive';
import { folders } from './scenarios/folders';
import { documents } from './scenarios/files';
import { readableResults } from './scenarios/plain-results';
import { thoughts } from './scenarios/thinking';
import { scheduledJobs } from './scenarios/cron';
import { browserPermissions } from './scenarios/approvals';
import { browserTabs } from './scenarios/browser-tabs';
import { browserSessions } from './scenarios/browser';
import { mcpTools } from './scenarios/mcp';
import { mcpAuthentication } from './scenarios/mcp-auth';
import { fusedConnections } from './scenarios/fused';

test('saved chat recovery: messages, cards, thoughts, documents, folders, archives, and scheduled jobs', async ({
  workspace,
}, info) => {
  test.setTimeout(240_000);
  await recoverTogether(await workspace(), info, {
    'Conversation history': conversation,
    'Structured cards': cards,
    'Readable results': readableResults,
    'Thought history': thoughts,
    'Archived chats': archives,
    'Chat folders': folders,
    'Scheduled jobs': scheduledJobs,
    'Document context and migration': documents,
  });
});

test('browser recovery: tab ownership, restored sessions, permissions, and closed tabs', async ({
  workspace,
}, info) => {
  test.setTimeout(180_000);
  await recoverTogether(await workspace(), info, {
    'Browser permissions': browserPermissions,
    'Tab ownership and closure': browserTabs,
    'Cookies, storage, and safe reopening': browserSessions,
  });
});

test('integration recovery: MCP tool policies and isolated Fused connections', async ({
  workspace,
}, info) => {
  test.setTimeout(180_000);
  await recoverTogether(await workspace(), info, {
    'MCP tool approvals': mcpTools,
    'MCP authentication and setup': mcpAuthentication,
    'Fused connection routing': fusedConnections,
  });
});
