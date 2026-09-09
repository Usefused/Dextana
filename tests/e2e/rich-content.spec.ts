import { expect } from '@playwright/test';
import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { test, start, reply } from './fixture';

const chart = {
  title: 'Quarterly revenue',
  type: 'bar',
  labels: ['Q1', 'Q2', 'Q3', 'Q4'],
  series: [
    { name: 'Revenue', values: [24, 32, -8, 48] },
    { name: 'Target', values: [20, 30, 36, 40] },
  ],
};

test('chat renders readable prose, tables, charts, diagrams and consent-loaded images', async ({
  workspace,
}, testInfo) => {
  test.setTimeout(120_000);
  let requests = 0;
  const preview = new Resvg(
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="280"><rect width="640" height="280" fill="#e7eee2"/><circle cx="510" cy="85" r="40" fill="#f4d899"/><path d="M0 250 160 80 330 260 460 120 640 270V280H0" fill="#8ca88b"/><path d="M0 280 230 150 410 280" fill="#52745a"/></svg>',
  )
    .render()
    .asPng();
  const server = createServer((_req, res) => {
    requests++;
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(preview);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const content = [
    '## A clearer view of the quarter',
    '**Revenue grew steadily**, with a temporary adjustment in Q3.\nThis source line should flow as one paragraph.',
    'Keep `[1, 2]` and `{"example": true}` intact in inline code.',
    '| Quarter | Revenue | Status |\n| :--- | ---: | :---: |\n| Q1 | 24 | On track |\n| Q2 | 32 | Ahead |',
    '```chart\n' + JSON.stringify(chart) + '\n```',
    '```mermaid\nflowchart LR\n  A[Collect context] --> B[Review evidence]\n  B --> C[Deliver report]\n```',
    '![Quarterly preview](http://127.0.0.1:' + port + '/preview.png)',
    '```ts\nconst quarters = [1, 2, 3, 4];\n```',
  ].join('\n\n');
  const work = await workspace((body, res) => {
    reply(body, res, content);
    return true;
  });
  try {
    await start(work.page, 'Review the quarter with visuals');
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', {
      timeout: 60_000,
    });
    const message = work.page.getByTestId('assistant-message');
    await expect(message.locator('strong').first()).toHaveText('Revenue grew steadily');
    await expect(message.locator('code').filter({ hasText: '[1, 2]' })).toHaveText('[1, 2]');
    await expect(message.getByRole('cell', { name: '24', exact: true })).toHaveCSS(
      'text-align',
      'right',
    );
    await expect(
      message.getByRole('img', { name: 'Quarterly revenue', exact: true }),
    ).toBeVisible();
    await message.getByText('View chart data', { exact: true }).click();
    await expect(message.getByRole('cell', { name: '-8', exact: true })).toBeVisible();
    await expect(message.getByRole('img', { name: 'Diagram', exact: true })).toBeVisible({
      timeout: 20_000,
    });
    expect(requests).toBe(0);
    await message.getByRole('button', { name: 'Show image: Quarterly preview' }).click();
    await expect(
      message.getByRole('img', { name: 'Quarterly preview', exact: true }),
    ).toBeVisible();
    expect(requests).toBe(1);
    await expect(message.getByRole('button', { name: 'Copy code' })).toBeVisible();
    await message.getByRole('button', { name: 'Copy code' }).click();
    await expect(message.getByRole('button', { name: 'Copied' })).toBeVisible();
    await message.getByRole('heading').first().scrollIntoViewIfNeeded();
    await work.page.screenshot({ path: testInfo.outputPath('rich-message.png') });
    await message.locator('.rich-chart').screenshot({ path: testInfo.outputPath('chart.png') });
    await message
      .getByRole('img', { name: 'Quarterly preview', exact: true })
      .scrollIntoViewIfNeeded();
    await work.page.screenshot({ path: testInfo.outputPath('rich-media.png') });
    const previousDiagram = await message
      .getByRole('img', { name: 'Diagram', exact: true })
      .getAttribute('src');
    await work.page.evaluate(() => window.dextana.setTheme('dark'));
    await expect(message.getByRole('img', { name: 'Quarterly preview', exact: true })).toBeVisible();
    expect(requests).toBe(1);
    await expect
      .poll(() => message.getByRole('img', { name: 'Diagram', exact: true }).getAttribute('src'))
      .not.toBe(previousDiagram);
    await message.getByRole('heading').first().scrollIntoViewIfNeeded();
    await work.page.screenshot({ path: testInfo.outputPath('rich-message-dark.png') });
    await message
      .locator('.rich-diagram')
      .screenshot({ path: testInfo.outputPath('diagram-dark.png') });
    await work.restart();
    await work.page
      .getByRole('button', { name: 'Review the quarter with visuals', exact: true })
      .click();
    await expect(
      work.page.getByRole('img', { name: 'Quarterly revenue', exact: true }),
    ).toBeVisible();
  } finally {
    await work.page.evaluate(() => window.dextana.setTheme('system'));
    await work.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('A2UI keeps useful components when one fails and context is searchable', async ({
  workspace,
}, testInfo) => {
  test.setTimeout(120_000);
  const envelopes = [
    { version: 'v0.9', createSurface: { surfaceId: 'review', catalogId: 'urn:dextana:display:1' } },
    {
      version: 'v0.9',
      updateComponents: {
        surfaceId: 'review',
        components: [
          { id: 'root', component: 'Card', child: 'body' },
          {
            id: 'body',
            component: 'Column',
            children: ['title', 'text', 'table', 'unsupported', 'chart'],
          },
          { id: 'title', component: 'Text', variant: 'h2', text: 'Quarterly review' },
          {
            id: 'text',
            component: 'Text',
            text: '**Ready for review.** Sources and figures are collected below.',
          },
          {
            id: 'table',
            component: 'Table',
            title: 'Deliverables',
            columns: ['Document', 'Status'],
            rows: { path: '/rows' },
          },
          { id: 'unsupported', component: 'UnknownWidget' },
          { id: 'chart', component: 'Chart', ...chart },
        ],
      },
    },
    {
      version: 'v0.9',
      updateDataModel: {
        surfaceId: 'review',
        value: {
          rows: [
            ['Quarterly report', 'Ready'],
            ['Budget', 'In review'],
          ],
        },
      },
    },
  ];
  const work = await workspace((body, res) => {
    reply(body, res, '```a2ui\n' + envelopes.map((e) => JSON.stringify(e)).join('\n') + '\n```');
    return true;
  });
  try {
    await start(work.page, 'Show a richer structured review');
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', {
      timeout: 60_000,
    });
    const message = work.page.getByTestId('assistant-message');
    await expect(message.getByRole('heading', { name: 'Quarterly review' })).toBeVisible();
    await expect(message.locator('strong')).toContainText(['Ready for review.']);
    await expect(message.getByRole('table', { name: 'Deliverables' })).toBeVisible();
    await expect(message.getByText('Unsupported component: UnknownWidget.')).toBeVisible();
    await expect(
      message.getByRole('img', { name: 'Quarterly revenue', exact: true }),
    ).toBeVisible();
    const file = join(
      work.directory,
      'Quarterly financial analysis and forecast September 2026.txt',
    );
    await writeFile(file, 'Financial review fixture');
    await work.page.evaluate(async (file) => {
      const state = await window.dextana.snapshot();
      const activity = state.activities.find((a) => a.title === 'Show a richer structured review')!;
      await window.dextana.attachContext(activity.id, [file]);
    }, file);
    const panel = work.page.getByRole('region', { name: 'Agent context', exact: true });
    await panel.getByRole('searchbox', { name: 'Search context' }).fill('September');
    await expect(
      panel.getByText('Quarterly financial analysis and forecast September 2026.txt', {
        exact: true,
      }),
    ).toBeVisible();
    await panel.getByRole('searchbox', { name: 'Search context' }).fill('missing document');
    await expect(panel.getByText('No matching context.')).toBeVisible();
    await panel.getByRole('searchbox', { name: 'Search context' }).fill('');
    await panel.locator('summary').filter({ hasText: 'Files' }).click();
    await message.getByRole('heading', { name: 'Quarterly review' }).scrollIntoViewIfNeeded();
    await work.page.screenshot({ path: testInfo.outputPath('structured-context.png') });
  } finally {
    await work.close();
  }
});
