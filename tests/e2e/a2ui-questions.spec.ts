import { expect } from '@playwright/test';
import { test, start, reply } from './fixture';

const questions =
  '```a2ui\n' +
  [
    { version: 'v0.9', createSurface: { surfaceId: 'report', catalogId: 'urn:dextana:display:1' } },
    {
      version: 'v0.9',
      updateComponents: {
        surfaceId: 'report',
        components: [
          {
            id: 'root',
            component: 'QuestionForm',
            title: 'Tailor your report',
            questions: [
              {
                id: 'audience',
                prompt: 'Who is the report for?',
                type: 'single',
                options: [
                  { id: 'team', label: 'My team' },
                  { id: 'leadership', label: 'Leadership' },
                ],
              },
              {
                id: 'sections',
                prompt: 'Which sections should I include?',
                type: 'multiple',
                options: [
                  { id: 'summary', label: 'Summary', description: 'A short overview' },
                  { id: 'metrics', label: 'Key metrics' },
                ],
              },
              { id: 'notes', prompt: 'Anything else?', type: 'text', required: false },
            ],
          },
        ],
      },
    },
  ]
    .map((item) => JSON.stringify(item))
    .join('\n') +
  '\n```';

test('live A2UI questions submit a normal reply in the same chat and stay answered after restart', async ({
  workspace,
}) => {
  const work = await workspace((body, response) => {
    const last =
      body.messages.filter((message: any) => message.role === 'user').at(-1)?.content ?? '';
    reply(
      body,
      response,
      last.includes('My answers to') ? 'I will tailor the report to your answers.' : questions,
    );
    return true;
  });
  await start(work.page, 'Help me tailor a report');
  const card = work.page.getByRole('region', { name: 'Tailor your report' });
  await expect(card.getByRole('button', { name: 'Send reply', exact: true })).toBeEnabled({
    timeout: 60000,
  });
  await card.getByRole('button', { name: 'Send reply', exact: true }).click();
  await expect(card.getByRole('alert')).toContainText('Who is the report for?');
  await card.getByLabel('Choose an option').selectOption('leadership');
  await card.getByRole('checkbox', { name: 'Summary', exact: true }).check();
  await card.getByRole('checkbox', { name: 'Key metrics', exact: true }).check();
  await expect(
    card.locator('input').and(card.getByLabel('Your answer', { exact: true })),
  ).toBeVisible();
  await card.getByLabel('Your answer', { exact: true }).fill('Focus on the last quarter.');
  await work.page.screenshot({ path: '/private/tmp/dext-a2ui-questions-filled.png' });
  const before = await work.page.evaluate(() => window.dextana.snapshot());
  const activity = before.activities.find((item) => item.title === 'Help me tailor a report')!;
  const questionId = activity.messages.at(-1)!.id;
  await work.page.evaluate(
    (activityId) => window.dextana.selectModel(activityId, 'qwen3:8b', 'off'),
    activity.id,
  );
  await expect(card.getByLabel('Choose an option')).toHaveValue('leadership');
  await expect(card.getByLabel('Your answer', { exact: true })).toHaveValue(
    'Focus on the last quarter.',
  );
  await work.app().evaluate(() => {
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      if (typeof init?.body === 'string') {
        const command = JSON.parse(init.body);
        if (command.action === 'start' && command.input?.replyToMessageId) {
          globalThis.fetch = original;
          throw new Error('Temporary connection lost');
        }
      }
      return original(input, init);
    };
  });
  await card.getByRole('button', { name: 'Send reply', exact: true }).click();
  await expect(card.getByRole('alert')).toContainText('Temporary connection lost');
  await expect(card.getByLabel('Your answer', { exact: true })).toHaveValue(
    'Focus on the last quarter.',
  );
  await expect(card.getByRole('checkbox', { name: 'Key metrics', exact: true })).toBeChecked();
  await card.getByRole('button', { name: 'Send reply', exact: true }).click();
  await expect(work.page.getByTestId('assistant-message').last()).toContainText(
    'tailor the report to your answers',
    { timeout: 60000 },
  );
  await expect(card).toContainText('Answered in your reply below.');
  const after = await work.page.evaluate(() => window.dextana.snapshot());
  const saved = after.activities.find((item) => item.id === activity.id)!;
  expect(saved.messages.filter((item) => item.replyToMessageId === questionId)).toHaveLength(1);
  expect(saved.messages.find((item) => item.replyToMessageId === questionId)?.content).toContain(
    'Leadership',
  );
  expect(saved.messages.find((item) => item.replyToMessageId === questionId)?.content).toContain(
    'Summary\nKey metrics',
  );
  expect(JSON.stringify(work.calls.at(-1).messages)).toContain('Focus on the last quarter.');
  const stale = await work.page.evaluate(
    async ({ activityId, replyToMessageId }) => {
      try {
        await window.dextana.start({
          activityId,
          replyToMessageId,
          prompt: 'Duplicate answer',
          model: 'qwen3:8b',
        });
        return 'accepted';
      } catch (error) {
        return (error as Error).message;
      }
    },
    { activityId: activity.id, replyToMessageId: questionId },
  );
  expect(stale).toContain('no longer waiting');
  await work.restart();
  await work.page.getByRole('button', { name: 'Help me tailor a report', exact: true }).click();
  await expect(work.page.getByRole('region', { name: 'Tailor your report' })).toContainText(
    'Answered in your reply below.',
  );
  await expect(work.page.getByRole('button', { name: 'Send reply', exact: true })).toHaveCount(0);
});

test('a free-text composer answer retires the previous question card', async ({ workspace }) => {
  let finish: (() => void) | undefined;
  const work = await workspace((body, response) => {
    const last =
      body.messages.filter((message: any) => message.role === 'user').at(-1)?.content ?? '';
    if (!last.includes('Use my own format')) reply(body, response, questions);
    else if (!body.messages.some((message: any) => message.role === 'tool'))
      reply(body, response, 'I’m reviewing your format.', [
        { function: { name: 'list_skills', arguments: {} } },
      ]);
    else finish = () => reply(body, response, 'Your own format is fine.');
    return true;
  });
  await start(work.page, 'Ask me report preferences');
  const button = work.page.getByRole('button', { name: 'Send reply', exact: true });
  await expect(button).toBeEnabled({ timeout: 60000 });
  await work.page.getByLabel('Describe your work').fill('Use my own format');
  await work.page.getByLabel('Describe your work').press('Enter');
  await expect.poll(() => !!finish).toBe(true);
  const card = work.page.getByRole('region', { name: 'Tailor your report' });
  await expect(card).toContainText('Continued in chat.');
  await expect(card.locator('input, textarea, select, button')).toHaveCount(0);
  await expect(work.page.getByRole('status', { name: 'Agent progress' })).toHaveText('Working…');
  finish!();
  await expect(work.page.getByTestId('assistant-message').last()).toContainText(
    'Your own format is fine.',
    { timeout: 60000 },
  );
  await expect(button).toHaveCount(0);
  await expect(work.page.getByRole('status', { name: 'Agent progress' })).toHaveCount(0);
  await work.restart();
  await work.page.getByRole('button', { name: 'Ask me report preferences', exact: true }).click();
  await expect(work.page.getByRole('region', { name: 'Tailor your report' })).toContainText(
    'Continued in chat.',
  );
});
