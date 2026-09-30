import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { ensureStack, type StackHandle } from '@tectonic/dev';

let stack: StackHandle;
let browser: Browser;
const contexts: BrowserContext[] = [];
const TEAM_ID = '5df357cb-4389-43da-83a3-22b9444fba31';
const TURN_ID = '3c6e7cda-91b2-4d8f-9c65-d57b91f5196f';

async function openKnowledgePage(): Promise<{ page: Page; releaseAccess: () => void }> {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  contexts.push(context);
  const page = await context.newPage();
  let releaseAccess!: () => void;
  const accessReady = new Promise<void>((resolve) => { releaseAccess = resolve; });
  await page.route('**/api/access', async (route) => {
    await accessReady;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ teams: [{ id: TEAM_ID, name: 'Payroll België', color: '#4338ca', role: 'owner' }], clients: [], examples: [] }),
    });
  });
  await page.goto(`${stack.baseUrl}/?as=roy`);
  await page.getByTestId('kennis-page').waitFor();
  return { page, releaseAccess };
}

async function mockChatStatus(page: Page) {
  await page.route('**/api/chat/status', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ available: true, model: 'fake-chat-model' }),
  }));
}

beforeAll(async () => {
  stack = await ensureStack();
  browser = await chromium.launch();
}, 120_000);

afterAll(async () => {
  for (const context of contexts) await context.close().catch(() => {});
  await browser?.close();
  await stack?.stop();
});

describe('project chat', () => {
  test('streams a reply, shows tool results, and reloads its team history', async () => {
    const { page, releaseAccess } = await openKnowledgePage();
    const turn = {
      id: TURN_ID,
      message: 'What is in Payroll België?',
      reply: 'The team has an active payroll project.',
      tools: [{ id: 'lookup-1', name: 'list_sources', status: 'completed', result: 'Payroll run: ready' }],
      status: 'completed',
      createdAt: '2026-09-30T12:00:00.000Z',
    };
    let history: typeof turn[] = [];
    await mockChatStatus(page);
    await page.route('**/api/projects/*/chat', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(history) });
        return;
      }
      expect(route.request().postDataJSON()).toEqual({ message: turn.message });
      history = [turn];
      const events = [
        { type: 'text', text: turn.reply },
        { type: 'tool', tool: turn.tools[0] },
        { type: 'done', turn },
      ];
      await route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: `${events.map((event) => JSON.stringify(event)).join('\n')}\n` });
    });

    releaseAccess();
    await page.getByRole('button', { name: 'Open project chat' }).click();
    const panel = page.getByRole('region', { name: 'Project chat' });
    await panel.waitFor();
    await page.getByRole('textbox', { name: 'Message' }).fill(turn.message);
    await page.getByRole('button', { name: 'Send' }).click();
    await page.getByText(turn.reply).waitFor();
    await panel.getByRole('button', { name: /Knowledge sources/ }).click();
    await page.getByText('Payroll run: ready').waitFor();

    await page.reload();
    await page.getByRole('button', { name: 'Open project chat' }).click();
    await page.getByText(turn.reply).waitFor();
    await page.getByRole('button', { name: 'Close chat' }).click();
    expect(await page.getByRole('region', { name: 'Project chat' }).count()).toBe(0);
  }, 90_000);

  test('keeps an active reply when closed and reopened', async () => {
    const { page, releaseAccess } = await openKnowledgePage();
    const turn = {
      id: '7a8a234c-c4e4-40b7-b92a-dc92a8c81c17',
      message: 'Keep this reply running',
      reply: 'The reply survived reopening the chat.',
      tools: [],
      status: 'completed',
      createdAt: '2026-09-30T12:00:00.000Z',
    };
    let historyRequests = 0;
    let signalPostStarted!: () => void;
    const postStarted = new Promise<void>((resolve) => { signalPostStarted = resolve; });
    let releasePost!: () => void;
    const postRelease = new Promise<void>((resolve) => { releasePost = resolve; });
    await mockChatStatus(page);
    await page.route('**/api/projects/*/chat', async (route) => {
      if (route.request().method() === 'GET') {
        historyRequests++;
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        return;
      }
      signalPostStarted();
      await postRelease;
      const events = [{ type: 'text', text: turn.reply }, { type: 'done', turn }];
      await route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: `${events.map((event) => JSON.stringify(event)).join('\n')}\n` });
    });

    releaseAccess();
    await page.getByRole('button', { name: 'Open project chat' }).click();
    await page.getByRole('textbox', { name: 'Message' }).fill(turn.message);
    await page.getByRole('button', { name: 'Send' }).click();
    await postStarted;
    const historyCountDuringRequest = historyRequests;
    await page.getByRole('button', { name: 'Close chat' }).click();
    await page.getByRole('button', { name: 'Open project chat' }).click();
    const panel = page.getByRole('region', { name: 'Project chat' });
    await panel.getByText(turn.message).waitFor();
    expect(historyRequests).toBe(historyCountDuringRequest);
    releasePost();
    await page.getByText(turn.reply).waitFor();
  }, 90_000);

  test('keeps a cancelled turn until delayed history saves it', async () => {
    const { page, releaseAccess } = await openKnowledgePage();
    const turn = {
      id: 'a78f8edf-472e-4cf3-b78a-f62c84ff7951',
      message: 'Stop this reply',
      reply: 'The reply was stopped by the user.',
      tools: [],
      status: 'cancelled',
      createdAt: new Date(Date.now() + 500).toISOString(),
    };
    let cancelRequested = false;
    let staleHistorySent = false;
    let signalPostStarted!: () => void;
    const postStarted = new Promise<void>((resolve) => { signalPostStarted = resolve; });
    let releasePost!: () => void;
    const postRelease = new Promise<void>((resolve) => { releasePost = resolve; });
    await mockChatStatus(page);
    await page.route('**/api/projects/*/chat', async (route) => {
      if (route.request().method() === 'GET') {
        if (!cancelRequested) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        } else if (!staleHistorySent) {
          staleHistorySent = true;
          await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        } else {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([turn]) });
        }
        return;
      }
      signalPostStarted();
      await postRelease;
      try {
        await route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: `${JSON.stringify({ type: 'done', turn })}\n` });
      } catch {
        // The browser has aborted this request. The history endpoint saves it later.
      }
    });

    releaseAccess();
    await page.getByRole('button', { name: 'Open project chat' }).click();
    await page.getByRole('textbox', { name: 'Message' }).fill(turn.message);
    await page.getByRole('button', { name: 'Send' }).click();
    await postStarted;
    cancelRequested = true;
    await page.getByRole('button', { name: 'Stop' }).click();
    await page.getByText('Response stopped.').waitFor();
    releasePost();
    await page.getByText(turn.reply).waitFor();
    expect(staleHistorySent).toBe(true);
  }, 90_000);
});
