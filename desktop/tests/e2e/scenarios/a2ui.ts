import { expect } from '@playwright/test';
import { start, reply } from '../fixture';

// Exercise the real Electron → Harnest → Ollama response path with deterministic model output.
import type { TestInfo } from '@playwright/test';
import type { RecoveryWorkspace, BeforeLaunch } from '../recovery';

export async function* cards(
  workspace: RecoveryWorkspace,
  testInfo: TestInfo,
): AsyncGenerator<void | BeforeLaunch, void, void> {
  const envelopes = [
    { version: 'v0.9', createSurface: { surfaceId: 'report', catalogId: 'urn:dextana:display:1' } },
    {
      version: 'v0.9',
      updateComponents: {
        surfaceId: 'report',
        components: [
          { id: 'root', component: 'Card', child: 'body' },
          {
            id: 'body',
            component: 'Column',
            children: ['title', 'status', 'document', 'website', 'references'],
          },
          { id: 'title', component: 'Text', text: 'Release overview', variant: 'h2' },
          { id: 'status', component: 'Text', text: { path: '/release/status' } },
          {
            id: 'document',
            component: 'Reference',
            target: '/documents/Budget.xlsx',
            label: 'Budget',
          },
          {
            id: 'website',
            component: 'Reference',
            target: 'https://example.com/report',
            label: 'Source report',
          },
          {
            id: 'references',
            component: 'Text',
            text: 'See [Brief](brief.pdf) and https://example.com. [Unsafe](javascript:alert)',
          },
        ],
      },
    },
    {
      version: 'v0.9',
      updateDataModel: { surfaceId: 'report', value: { release: { status: 'Ready to review' } } },
    },
  ];
  const response =
    '```a2ui\n' + envelopes.map((envelope) => JSON.stringify(envelope)).join('\n') + '\n```';
  const work = await workspace((body, res) => {
    reply(body, res, response);
    return true;
  });
  try {
    await start(work.page, 'Show the release overview as A2UI');
    await expect(work.page.getByTestId('activity-status')).toHaveText('Completed', {
      timeout: 60_000,
    });
    const card = work.page.getByTestId('assistant-message').locator('.ui-card');
    await expect(card).toContainText('Release overview');
    await expect(card).toContainText('Ready to review');
    await expect(card.getByRole('img', { name: 'XLSX file', exact: true })).toBeVisible();
    await expect(card.getByRole('img', { name: 'PDF file', exact: true })).toBeVisible();
    await expect(card.getByRole('link', { name: 'Website Source report' })).toHaveAttribute(
      'href',
      'https://example.com/report',
    );
    await expect(card.locator('a[href^="javascript:"]')).toHaveCount(0);
    await expect(work.page.getByTestId('assistant-message').locator('pre')).toBeHidden();
    yield;
    const page = work.page;
    await page
      .getByRole('button', { name: 'Show the release overview as A2UI', exact: true })
      .click();
    await expect(page.getByTestId('assistant-message').locator('.ui-card')).toContainText(
      'Ready to review',
    );
    await expect(page.getByRole('img', { name: 'XLSX file', exact: true })).toBeVisible();
    await expect(page.getByText('UI source', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('assistant-message')).not.toContainText('updateDataModel');
  } finally {
    await work.close();
  }
}
