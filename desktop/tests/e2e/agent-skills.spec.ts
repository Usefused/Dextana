import { expect } from '@playwright/test';
import { test, start, reply } from './fixture';

function catalog(value: any): any[] | undefined {
  if (typeof value === 'string') {
    try {
      return catalog(JSON.parse(value));
    } catch {
      return;
    }
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value.skills)) return value.skills;
  for (const nested of Object.values(value)) {
    const found = catalog(nested);
    if (found) return found;
  }
}

for (const invalid of [
  { source: 'dextana', version: '' },
  { source: 'filesystem', version: 'made-up-version' },
])
  test(`invalid skill lookup ${invalid.source}/${invalid.version} recovers in the same run`, async ({
    workspace,
  }) => {
    test.setTimeout(120_000);
    let recovered = false;
    let loaded = false;
    const work = await workspace((body, res) => {
      const results = body.messages.filter((message: any) => message.role === 'tool');
      if (!results.length) {
        reply(body, res, '', [
          {
            function: { name: 'load_skill', arguments: { name: 'browser-work', ...invalid } },
          },
        ]);
      } else if (results.length === 1) {
        recovered = String(results[0].content).includes('No skill was loaded');
        reply(body, res, '', [
          { function: { name: 'list_skills', arguments: { query: 'browser', source: '' } } },
        ]);
      } else if (results.length === 2) {
        const skill = catalog(results[1].content)?.find((item: any) => item.id === 'browser-work');
        if (!skill) reply(body, res, 'Skill missing.');
        else
          reply(body, res, '', [
            {
              function: {
                name: 'load_skill',
                arguments: { name: skill.id, source: skill.source, version: skill.version },
              },
            },
          ]);
      } else {
        loaded = String(results.at(-1).content).includes(
          'Tool success does not prove the website accepted the action',
        );
        reply(body, res, 'Recovery verified.');
      }
      return true;
    });
    try {
      await start(work.page, 'Check browser skill discovery recovery');
      await expect(work.page.getByTestId('assistant-message').last()).toContainText(
        'Recovery verified.',
        { timeout: 60_000 },
      );
      expect(recovered).toBe(true);
      expect(loaded).toBe(true);
    } finally {
      await work.close();
    }
  });

test('agent discovers and progressively loads browser guidance through Harnest', async ({
  workspace,
}) => {
  test.setTimeout(120_000);
  let discovered = false,
    loaded = false,
    conciseCore = false,
    conciseBrowser = false,
    accurateFailure = false;
  const work = await workspace((body, res) => {
    conciseCore ||= body.messages.some(
      (m: any) => m.role === 'system' && String(m.content).includes('Keep deliberation private'),
    );
    const results = body.messages.filter((m: any) => m.role === 'tool');
    if (!results.length) {
      reply(body, res, '', [
        {
          function: { name: 'list_skills', arguments: { query: 'website interaction', limit: 50 } },
        },
      ]);
    } else if (results.length === 1) {
      const skills = catalog(results[0].content);
      const skill = skills?.find(
        (item: any) => item.id === 'browser-work' || item.name === 'browser-work',
      );
      discovered = !!skill;
      if (!skill) reply(body, res, 'No browser skill found.');
      else
        reply(body, res, '', [
          {
            function: {
              name: 'load_skill',
              arguments: { name: skill.id, source: skill.source, version: skill.version },
            },
          },
        ]);
    } else {
      loaded = JSON.stringify(results.at(-1).content).includes(
        'Tool success does not prove the website accepted the action',
      );
      conciseBrowser = JSON.stringify(results.at(-1).content).includes(
        'Act without narrating clicks, reads, retries, or waiting',
      );
      accurateFailure = JSON.stringify(results.at(-1).content).includes(
        'A generic script error is a tool failure, not evidence that a website blocks automation',
      );
      reply(body, res, loaded ? 'Browser guidance loaded.' : 'Browser guidance unavailable.');
    }
    return true;
  });
  try {
    await start(work.page, 'Load the website interaction skill');
    await expect(work.page.getByTestId('assistant-message').last()).toContainText(
      'Browser guidance loaded.',
      { timeout: 60_000 },
    );
    expect(discovered).toBe(true);
    expect(loaded).toBe(true);
    expect(conciseCore).toBe(true);
    expect(conciseBrowser).toBe(true);
    expect(accurateFailure).toBe(true);
  } finally {
    await work.close();
  }
});
