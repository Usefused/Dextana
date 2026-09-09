import { expect, it } from 'vitest';
import type { Activity, Message } from '../../src/shared/types';
import {
  ownerBrowserChoice,
  requestedBrowser,
  selectBrowser,
  prepareBrowserAction,
  assertBrowserDestination,
} from '../../src/main/user-browser/routing';
const message = (content: string, id = content, role: 'user' | 'assistant' = 'user') =>
  ({ id, role, content }) as Message;
const activity = (messages: Message[]) => ({ id: 'chat', messages }) as Activity;
const prepare = (args: Record<string, unknown>) =>
  args.action === 'connect_user'
    ? { action: 'connect_user', _userConnection: 'request' }
    : { ...args, tab_id: 'in-app-tab' };

it.each([
  'Hey hey, can you use the zoho on my browser please',
  'Not in-app',
  'I just said not inapp. My computer use browser',
  'Use my external Chrome browser',
  'Can you use browser use',
])('routes the owner correction to the external connection: %s', (content) => {
  const chat = activity([message(content)]);
  expect(prepareBrowserAction(chat, { action: 'list_tabs' }, prepare)).toEqual({
    action: 'connect_user',
    _userConnection: 'request',
  });
  expect(
    prepareBrowserAction(chat, { action: 'open', url: 'https://mail.zoho.com' }, prepare),
  ).toEqual({ action: 'connect_user', _userConnection: 'request' });
});
it('never takes browser choice from assistant output, generated prompts, or quoted code', () => {
  expect(
    requestedBrowser(activity([message('Use my browser', 'assistant', 'assistant')])),
  ).toBeUndefined();
  expect(
    requestedBrowser(activity([{ ...message('Use my browser'), generated: true }])),
  ).toBeUndefined();
  expect(
    ownerBrowserChoice('Explain this example:\n```\nUse my browser\n```\n> Not in-app'),
  ).toBeUndefined();
});
it('keeps explicit corrections across turns and respects a newer UI selection', () => {
  const chat = activity([message('Use my browser', 'one'), message('Now read the page', 'two')]);
  expect(requestedBrowser(chat)).toBe('user');
  selectBrowser(chat, 'in-app');
  expect(requestedBrowser(chat)).toBe('in-app');
  chat.messages.push(message('Not in-app', 'three'));
  expect(requestedBrowser(chat)).toBe('user');
  chat.messages.push(message('Use the in-app browser', 'four'));
  expect(requestedBrowser(chat)).toBe('in-app');
});
it('preserves attached tab handles and rejects stale in-app approvals after a correction', () => {
  const chat = activity([message('Read this page')]);
  const old = prepareBrowserAction(chat, { action: 'read' }, prepare);
  chat.messages.push(message('Not in-app'));
  expect(() => assertBrowserDestination(chat, old)).toThrow('not executed');
  const connected = prepareBrowserAction(
    chat,
    { action: 'read', tab_id: 'external-tab' },
    (args) => ({ ...args, _userConnection: 'connection' }),
  );
  expect(connected).toMatchObject({ action: 'read', tab_id: 'external-tab' });
  expect(() => assertBrowserDestination(chat, connected)).not.toThrow();
});

it('a newer refusal to use the external browser overrides an older selection', () => {
  expect(
    requestedBrowser(activity([message('Use my browser'), message("Don't use my browser")])),
  ).toBe('in-app');
});
