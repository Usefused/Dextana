import { expect } from '@playwright/test';
import { test, start, reply } from './fixture';

test('a worker question appears in the main chat while a sibling is busy and resumes only its caller', async ({
  workspace,
}) => {
  let finishSibling: (() => void) | undefined;
  const work = await workspace((body, response) => {
    const input =
      body.messages.filter((message: any) => message.role === 'user').at(-1)?.content ?? '';
    const hasToolResult = body.messages.some((message: any) => message.role === 'tool');
    if (input.includes('Worker asks for audience')) {
      if (hasToolResult) reply(body, response, 'Audience confirmed: Leadership.');
      else
        reply(body, response, '', [
          {
            function: {
              name: 'ask_questions',
              arguments: {
                title: 'Report audience',
                questions: [
                  {
                    id: 'audience',
                    prompt: 'Who should I write for?',
                    type: 'single',
                    options: [
                      { id: 'team', label: 'My team' },
                      { id: 'leadership', label: 'Leadership' },
                    ],
                  },
                ],
              },
            },
          },
        ]);
    } else if (input.includes('Worker produces metrics')) {
      finishSibling = () => reply(body, response, 'The metrics are ready.');
    } else if (hasToolResult) reply(body, response, 'Both assignments finished for Leadership.');
    else
      reply(body, response, '', [
        {
          function: {
            name: 'delegate',
            arguments: {
              tasks: [
                { prompt: 'Worker asks for audience', model: '' },
                { prompt: 'Worker produces metrics', model: '' },
              ],
            },
          },
        },
      ]);
    return true;
  });
  await start(work.page, 'Coordinate two independent report assignments');
  const card = work.page.getByRole('region', { name: 'Report audience', exact: true });
  await expect(card.getByRole('button', { name: 'Send reply', exact: true })).toBeEnabled({
    timeout: 60000,
  });
  const snapshot = await work.page.evaluate(() => window.dextana.snapshot());
  const parent = snapshot.activities.find(
    (activity) => activity.title === 'Coordinate two independent report assignments',
  )!;
  const worker = snapshot.activities.find(
    (activity) => activity.title === 'Worker produces metrics',
  )!;
  expect(worker.parentId).toBe(parent.id);
  expect(['starting', 'running']).toContain(worker.status);
  expect(parent.status).toBe('running');
  await expect(
    work.page.getByText('Agent question · Worker asks for audience', { exact: true }),
  ).toBeVisible();
  await expect.poll(() => !!finishSibling).toBe(true);
  finishSibling!();
  await expect
    .poll(
      async () =>
        (await work.page.evaluate(() => window.dextana.snapshot())).activities.find(
          (activity) => activity.id === worker.id,
        )?.status,
    )
    .toBe('completed');
  await expect(card.getByRole('button', { name: 'Send reply', exact: true })).toBeEnabled();
  expect(
    (await work.page.evaluate(() => window.dextana.snapshot())).activities.find(
      (activity) => activity.id === parent.id,
    )?.status,
  ).toBe('running');
  await card.getByLabel('Choose an option').selectOption('leadership');
  await card.getByRole('button', { name: 'Send reply', exact: true }).click();
  await expect(work.page.getByTestId('assistant-message').last()).toContainText(
    'Both assignments finished for Leadership.',
    { timeout: 60000 },
  );
  await expect(work.page.getByText('You replied', { exact: true })).toBeVisible();
  const ownerCall = work.calls.at(-1);
  expect(JSON.stringify(ownerCall.messages)).toContain('clarifications');
  expect(JSON.stringify(ownerCall.messages)).toContain('Leadership');
  const questionCalls = work.calls.filter((body) =>
    body.messages.some(
      (message: any) =>
        message.role === 'user' && message.content?.includes('Worker asks for audience'),
    ),
  );
  expect(JSON.stringify(questionCalls.at(-1).messages)).toContain('Leadership');
  await work.restart();
  await work.page
    .getByRole('button', { name: 'Coordinate two independent report assignments', exact: true })
    .click();
  await expect(work.page.getByText('You replied', { exact: true })).toBeVisible();
  await expect(work.page.getByRole('button', { name: 'Send reply', exact: true })).toHaveCount(0);
});
