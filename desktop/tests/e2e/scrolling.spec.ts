import { test, expect } from '@playwright/test';
import { preview, type PreviewServer } from 'vite';

let server: PreviewServer;
test.beforeAll(async () => {
  server = await preview({ preview: { port: 0, host: '127.0.0.1' } });
});
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
});

test('browser controls stay out of the chat header and external browser access lives in settings', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const snapshot: any = {
      settings: { defaultModel: 'test', models: ['test'], ollamaUrl: '' },
      fused: { enabled: false, url: '', hasToken: false },
      activities: [
        {
          id: 'chat',
          title: 'Chat without browsing',
          model: 'test',
          status: 'completed',
          events: [],
          messages: [],
        },
      ],
    };
    let publish: (value: any) => void;
    (window as any).dextana = {
      snapshot: async () => structuredClone(snapshot),
      subscribe: (callback: any) => {
        publish = callback;
        return () => {};
      },
      onOpenActivity: () => () => {},
      onOpenDesktop: () => () => {},
      onOpenNotifications: () => () => {},
      notification: async () => {},
      selectActivity: async () => {},
    };
    (window as any).changeSavedBrowser = (browser: any) => {
      snapshot.activities[0].browser = browser;
      publish(structuredClone(snapshot));
    };
  });
  await page.goto(server.resolvedUrls!.local[0]);
  await page.getByRole('button', { name: 'Chat without browsing', exact: true }).click();
  const browserButton = page.getByRole('button', { name: /^(Reopen|Show) browser$/ });
  const userBrowserButton = page.getByRole('button', { name: 'Use my browser', exact: true });
  await expect(browserButton).toHaveCount(0);
  await expect(userBrowserButton).toHaveCount(0);
  const browser = { url: 'https://example.com', needsReopen: true };
  await page.evaluate((browser) => (window as any).changeSavedBrowser(browser), browser);
  await expect(browserButton).toHaveCount(0);
  const tab = {
    id: 'tab',
    activityId: 'chat',
    url: browser.url,
    title: 'Example',
    needsReopen: true,
  };
  await page.evaluate((browser) => (window as any).changeSavedBrowser(browser), {
    ...browser,
    tabs: [tab],
  });
  await expect(browserButton).toHaveCount(0);
  await page.evaluate((browser) => (window as any).changeSavedBrowser(browser), {
    ...browser,
    needsReopen: false,
    tabs: [tab],
  });
  await expect(browserButton).toHaveCount(0);
  await page.evaluate((browser) => (window as any).changeSavedBrowser(browser), {
    ...browser,
    tabs: [{ ...tab, activityId: 'other-chat' }],
  });
  await expect(browserButton).toHaveCount(0);
  await page.evaluate((browser) => (window as any).changeSavedBrowser(browser), {
    ...browser,
    tabs: [],
  });
  await expect(browserButton).toHaveCount(0);
  await page.getByRole('button', { name: 'Chat settings', exact: true }).click();
  await expect(userBrowserButton).toBeVisible();
});

test('keeps a new draft when the previous queued message finishes saving', async ({ page }) => {
  await page.addInitScript(() => {
    const snapshot = {
      settings: { defaultModel: 'test', models: ['test'], ollamaUrl: '' },
      fused: { enabled: false, url: '', hasToken: false },
      activities: [
        {
          id: 'draft',
          title: 'Draft preservation',
          model: 'test',
          status: 'running',
          browser: {
            url: 'https://example.com',
            needsReopen: true,
            tabs: [
              {
                id: 'saved-tab',
                activityId: 'draft',
                url: 'https://example.com',
                title: 'Example',
                needsReopen: true,
              },
            ],
          },
          queue: [] as any[],
          events: [],
          messages: [],
        },
      ],
    };
    let publish: (value: any) => void;
    (window as any).dextana = {
      snapshot: async () => structuredClone(snapshot),
      subscribe: (callback: any) => {
        publish = callback;
        return () => {};
      },
      onOpenActivity: () => () => {},
      onOpenDesktop: () => () => {},
      onOpenNotifications: () => () => {},
      notification: async () => {},
      selectActivity: async () => {},
      start: (input: any) =>
        new Promise<string>((resolve) => {
          // Hold the acknowledgement so typing during a save is deterministic.
          (window as any).finishSave = () => {
            snapshot.activities[0].queue.push({
              id: String(snapshot.activities[0].queue.length),
              prompt: input.prompt,
              model: input.model,
            });
            publish(structuredClone(snapshot));
            resolve('draft');
          };
        }),
    };
  });
  await page.goto(server.resolvedUrls!.local[0]);
  await page.getByRole('button', { name: 'Draft preservation', exact: true }).click();
  await expect(page.getByRole('button', { name: /^(Reopen|Show) browser$/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Use my browser', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Chat settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Use my browser', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  const input = page.getByLabel('Describe your work');
  const send = page.getByRole('button', { name: 'Send message', exact: true });
  await input.fill('Keep this queued');
  await send.click();
  await expect(send).toBeDisabled();
  await input.fill('Apply this correction now');
  await page.evaluate(() => (window as any).finishSave());
  await expect(send).toBeEnabled();
  await expect(input).toHaveValue('Apply this correction now');
  await send.click();
  await expect(send).toBeDisabled();
  await page.evaluate(() => (window as any).finishSave());
  await expect(input).toHaveValue('');
  await expect(page.getByLabel('Queued messages').locator('.queued-message')).toHaveText([
    '1.Keep this queuedSteer',
    '2.Apply this correction nowSteer',
  ]);
  await expect(page.getByRole('button', { name: 'Stop activity' })).toBeEnabled();
});

test('stream follows content, respects manual scrolling, and resumes at latest', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const snapshot = {
      settings: { defaultModel: 'test', models: ['test'], ollamaUrl: '' },
      fused: { enabled: false, url: '', hasToken: false },
      activities: [
        {
          id: 'one',
          title: 'scrolling test',
          model: 'test',
          status: 'running',
          queue: [] as any[],
          events: [],
          messages: [{ id: 'reply', role: 'assistant', content: 'Line\n\n'.repeat(100) }],
        },
      ],
    };
    let listener: (value: any) => void;
    (window as any).appendReply = () => {
      snapshot.activities[0].messages.at(-1)!.content += 'More content\n\n'.repeat(20);
      listener(structuredClone(snapshot));
    };
    (window as any).completeReply = () => {
      snapshot.activities[0].status = 'completed';
      listener(structuredClone(snapshot));
    };
    (window as any).dextana = {
      snapshot: async () => structuredClone(snapshot),
      subscribe: (callback: any) => {
        listener = callback;
        return () => {};
      },
      onOpenActivity: () => () => {},
      onOpenDesktop: () => () => {},
      onOpenNotifications: () => () => {},
      notification: async () => {},
      selectActivity: async () => {},
      start: async (input: any) => {
        if (snapshot.activities[0].status === 'completed') {
          snapshot.activities[0].messages.push(
            { id: 'follow-up', role: 'user', content: input.prompt },
            { id: 'next-reply', role: 'assistant', content: '' },
          );
          snapshot.activities[0].status = 'running';
          listener(structuredClone(snapshot));
          return 'one';
        }
        snapshot.activities[0].queue.push({
          id: 'queued',
          prompt: input.prompt,
          model: input.model,
        });
        listener(structuredClone(snapshot));
        return 'one';
      },
      cancel: async () => {},
    };
  });
  await page.goto(server.resolvedUrls!.local[0]);
  await page.getByRole('button', { name: 'Scrolling test', exact: true }).click();
  const transcript = page.getByLabel('Conversation', { exact: true });
  const mainBounds = (await page.locator('main').boundingBox())!;
  const scrollBounds = (await transcript.boundingBox())!;
  const contextBounds = (await page.getByRole('region', { name: 'Agent context' }).boundingBox())!;
  expect(scrollBounds.x + scrollBounds.width).toBe(contextBounds.x);
  expect(contextBounds.x + contextBounds.width).toBeLessThanOrEqual(
    mainBounds.x + mainBounds.width,
  );
  await expect(page.getByRole('heading', { name: 'Scrolling test', exact: true })).toBeVisible();
  const gap = () => transcript.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);
  const append = () => page.evaluate(() => (window as any).appendReply());
  await expect.poll(gap).toBeLessThan(3);
  await append();
  await expect.poll(gap).toBeLessThan(3);
  await transcript.hover();
  const jump = page.getByRole('button', { name: 'Jump to latest' });
  await page.mouse.wheel(0, -40);
  await expect.poll(gap).toBeGreaterThan(20);
  await expect(jump).toBeHidden();
  await page.mouse.wheel(0, -140);
  await expect(jump).toBeVisible();
  await page.mouse.wheel(0, 140);
  await expect.poll(gap).toBeLessThan(64);
  await expect(jump).toBeHidden();
  await page.mouse.wheel(0, -400);
  await expect.poll(gap).toBeGreaterThan(100);
  const top = await transcript.evaluate((el) => el.scrollTop);
  await append();
  await expect.poll(() => transcript.evaluate((el) => el.scrollTop)).toBe(top);
  await page.getByRole('button', { name: 'Jump to latest' }).click();
  await expect.poll(gap).toBeLessThan(3);
  await append();
  await expect.poll(gap).toBeLessThan(3);
  const input = page.getByLabel('Describe your work');
  expect((await input.boundingBox())!.height).toBeLessThan(40);
  await expect(page.getByRole('button', { name: 'Stop activity' })).toBeVisible();
  await transcript.hover();
  await page.mouse.wheel(0, -400);
  await expect.poll(gap).toBeGreaterThan(100);
  await input.fill('Follow up after this response');
  await expect(page.getByRole('button', { name: 'Stop activity' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByLabel('Queued messages')).toContainText('Follow up after this response');
  await expect(input).toHaveValue('');
  await expect.poll(gap).toBeLessThan(3);
  await append();
  await expect.poll(gap).toBeLessThan(3);
  await expect(page.getByRole('button', { name: 'Stop activity' })).toBeVisible();
  await input.fill('A longer draft\n'.repeat(20));
  expect((await input.boundingBox())!.height).toBeLessThanOrEqual(160);
  await expect(input).toBeInViewport();
  await expect.poll(gap).toBeLessThan(3);
  await input.fill('');
  expect((await input.boundingBox())!.height).toBeLessThan(40);
  await page.evaluate(() => (window as any).completeReply());
  await transcript.hover();
  await page.mouse.wheel(0, -500);
  await expect.poll(gap).toBeGreaterThan(100);
  await input.fill('A new message after reading earlier output');
  await input.press('Enter');
  await expect(page.locator('.message.user').last()).toContainText(
    'A new message after reading earlier output',
  );
  await expect.poll(gap).toBeLessThan(3);
  // No thought updates: only ordinary assistant output should keep the viewport pinned.
  for (let chunk = 0; chunk < 3; chunk++) {
    await append();
    await expect.poll(gap).toBeLessThan(3);
  }
  const output = (await page.getByTestId('assistant-message').last().boundingBox())!;
  await page.mouse.click(output.x + 20, output.y + output.height - 20);
  await append();
  await expect.poll(gap).toBeLessThan(3);
});

test('renders Markdown and streamed results without exposing display payloads', async ({
  page,
}) => {
  const markdown =
    '# Project report\n\n**Ready** for review.\n\n- [x] Completed\n- [ ] Next step\n\n| Task | Status |\n| --- | --- |\n| Review | Ready |\n\n```ts\nconst result = "ready";\n```\n\n[Documentation](https://example.com/docs)\n\n[Unsafe](javascript:alert(1))\n\n<script>window.injected = true</script>';
  await page.addInitScript((initial) => {
    const snapshot = {
      settings: { defaultModel: 'test', models: ['test'], ollamaUrl: '' },
      fused: { enabled: false, url: '', hasToken: false },
      activities: [
        {
          id: 'render',
          title: 'Rich responses',
          model: 'test',
          status: 'running',
          events: [],
          messages: [{ id: 'reply', role: 'assistant', content: initial }],
        },
      ],
    };
    let publish: (snapshot: any) => void;
    (window as any).setReply = (content: string) => {
      snapshot.activities[0].messages[0].content = content;
      publish(structuredClone(snapshot));
    };
    (window as any).dextana = {
      snapshot: async () => structuredClone(snapshot),
      subscribe: (callback: any) => {
        publish = callback;
        return () => {};
      },
      onOpenActivity: () => () => {},
      onOpenDesktop: () => () => {},
      onOpenNotifications: () => () => {},
      notification: async () => {},
      selectActivity: async () => {},
      openLink: async (url: string) => {
        (window as any).openedLink = url;
      },
    };
  }, markdown);
  await page.goto(server.resolvedUrls!.local[0]);
  await page.getByRole('button', { name: 'Rich responses', exact: true }).click();
  const reply = page.getByTestId('assistant-message');
  // Older saved messages predate per-response model labels.
  await expect(page.getByLabel('Response model')).toHaveText('Test');
  await expect(reply.getByRole('heading', { name: 'Project report' })).toBeVisible();
  await expect(reply.getByRole('table')).toContainText('Review');
  await expect(reply.getByRole('checkbox').first()).toBeChecked();
  await expect(reply.locator('code')).toContainText('const result');
  await expect(reply.locator('script')).toHaveCount(0);
  await expect(reply.getByRole('link', { name: 'Unsafe' })).toHaveCount(0);
  await reply.getByRole('link', { name: 'Documentation' }).click();
  expect(await page.evaluate(() => (window as any).openedLink)).toBe('https://example.com/docs');
  expect(await page.evaluate(() => (window as any).injected)).toBeUndefined();
  const messages = [
    {
      version: 'v0.9',
      createSurface: { surfaceId: 'summary', catalogId: 'urn:dextana:display:1' },
    },
    {
      version: 'v0.9',
      updateComponents: {
        surfaceId: 'summary',
        components: [
          { id: 'root', component: 'Card', child: 'body' },
          { id: 'body', component: 'Column', children: ['heading', 'status'] },
          { id: 'heading', component: 'Text', text: 'Project summary', variant: 'h2' },
          { id: 'status', component: 'Text', text: { path: '/status' } },
        ],
      },
    },
    {
      version: 'v0.9',
      updateDataModel: { surfaceId: 'summary', value: { status: 'Ready for review' } },
    },
  ];
  const jsonl = messages.map((message) => JSON.stringify(message)).join('\n');
  await page.evaluate(
    (source) => (window as any).setReply('```a2ui\n' + source + '\n{"version":'),
    jsonl,
  );
  await expect(reply.locator('.ui-card')).toContainText('Ready for review');
  await expect(reply).toContainText('Preparing results…');
  await page.evaluate((source) => (window as any).setReply('```a2ui\n' + source + '\n```'), jsonl);
  await expect(reply).not.toContainText('Preparing results…');
  await page.screenshot({ path: '/tmp/dextana-rich-response.png' });
  await page.evaluate(
    (source) => (window as any).setReply(source),
    jsonl +
      '\n' +
      JSON.stringify({
        version: 'v0.9',
        updateComponents: {
          surfaceId: 'summary',
          components: [{ id: 'root', component: 'Button' }],
        },
      }),
  );
  await expect(reply).toContainText('Unsupported component: Button.');
  await expect(reply.locator('pre')).toHaveCount(0);
  await expect(reply).not.toContainText('updateComponents');
  await page.evaluate(
    (source) => (window as any).setReply(source),
    jsonl +
      '\n' +
      JSON.stringify({
        version: 'v0.9',
        updateComponents: {
          surfaceId: 'summary',
          components: [{ id: 'root', component: 'Column', children: ['root'] }],
        },
      }),
  );
  await expect(reply).toContainText('Invalid or oversized UI tree.');
});
