import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { ensureStack, type StackHandle } from '@tectonic/dev';

let stack: StackHandle;
let browser: Browser;
const contexts: BrowserContext[] = [];

async function open(user: string, options: { viewport?: { width: number; height: number }; hash?: string } = {}): Promise<Page> {
  const context = await browser.newContext({ viewport: options.viewport ?? { width: 1400, height: 900 } });
  contexts.push(context);
  const page = await context.newPage();
  page.on('pageerror', (error) => console.error(`[${user}] page error:`, error));
  await page.goto(`${stack.baseUrl}/?as=${user}${options.hash ?? ''}`);
  // The app lands on the Vandeputte knowledge portfolio; these specs exercise the task board.
  if (!options.hash) await gotoBoardProject(page);
  return page;
}

/** The switcher's options are in the DOM on every layout, unlike the desktop sidebar links. */
async function gotoBoardProject(page: Page) {
  const id = await page.locator('[data-testid="project-switcher"] option', { hasText: 'Launch Website' }).getAttribute('value');
  await page.evaluate((projectId) => (window.location.hash = `#/projects/${projectId}`), id);
}

async function projectIdByName(page: Page, name: string): Promise<string> {
  const link = page.locator('[data-testid="project-link"]', { hasText: name });
  await link.waitFor();
  const href = await link.getAttribute('href');
  return href!.replace('#/projects/', '');
}

async function waitOnline(page: Page) {
  await page.locator('[data-testid="connection-status"][data-status="online"]').waitFor({ timeout: 15_000 });
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

describe('board', () => {
  test('shows the identity picker, then the seeded board with live status', async () => {
    const context = await browser.newContext();
    contexts.push(context);
    const page = await context.newPage();
    await page.goto(stack.baseUrl);
    await page.locator('[data-testid="identity-picker"]').waitFor();
    await page.click('[data-testid="identity-ada"]');
    await gotoBoardProject(page);
    await page.locator('[data-testid="project-title"]', { hasText: 'Launch Website' }).waitFor();
    expect(await page.locator('[data-testid="project-title"]').innerText()).toBe('Launch Website');
    expect(await page.locator('[data-testid="task-card"]').count()).toBeGreaterThan(5);
    await waitOnline(page);
  }, 90_000);

  test('a created task persists across a full page reload', async () => {
    const page = await open('ada');
    await waitOnline(page);
    await page.click('[data-testid="add-backlog"]');
    await page.fill('[data-testid="task-title"]', 'E2E persisted task');
    await page.selectOption('[data-testid="task-priority"]', 'high');
    await page.click('[data-testid="task-save"]');
    await page.locator('[data-testid="task-card"]', { hasText: 'E2E persisted task' }).waitFor();
    await page.locator('[data-testid="toast"]', { hasText: 'Task created' }).waitFor();

    await page.reload();
    const card = page.locator('[data-testid="task-card"]', { hasText: 'E2E persisted task' });
    await card.waitFor();
    expect(await card.getAttribute('data-status')).toBe('backlog');
    expect(await card.locator('.chip--priority-high').count()).toBe(1);
  }, 90_000);

  test('changes made in one browser session appear live in another', async () => {
    const ada = await open('ada');
    const grace = await open('grace');
    await waitOnline(ada);
    await waitOnline(grace);
    // Both are on Launch Website; presence should list both.
    await ada.locator('[data-testid="presence"]', { hasText: 'Grace Hopper is here' }).waitFor();

    const card = grace.locator('[data-testid="task-card"][data-status="backlog"]').first();
    const title = await card.locator('.task-title').innerText();
    await card.locator('[data-testid="task-move"]').selectOption('review');

    const moved = ada.locator('[data-testid="column-review"] [data-testid="task-card"]', { hasText: title });
    await moved.waitFor();
    expect(await moved.evaluate((el) => el.classList.contains('task-card--changed'))).toBe(true);
    await ada.locator('[data-testid="toast"]', { hasText: `moved “${title}” to Review` }).waitFor();

    // And a task created by Ada shows up for Grace without a reload.
    await ada.click('[data-testid="add-in_progress"]');
    await ada.fill('[data-testid="task-title"]', 'Created by Ada live');
    await ada.click('[data-testid="task-save"]');
    await grace.locator('[data-testid="column-in_progress"] [data-testid="task-card"]', { hasText: 'Created by Ada live' }).waitFor();
  }, 90_000);

  test('after losing the connection, a session reconnects and refetches what it missed', async () => {
    const ada = await open('ada');
    const grace = await open('grace');
    await waitOnline(ada);
    await waitOnline(grace);

    // Ada drops offline: the socket closes and the status pill reflects it.
    await ada.context().setOffline(true);
    await ada.locator('[data-testid="connection-status"][data-status="reconnecting"]').waitFor({ timeout: 15_000 });

    // Grace keeps working while Ada is offline.
    await grace.click('[data-testid="add-review"]');
    await grace.fill('[data-testid="task-title"]', 'Made while Ada was offline');
    await grace.click('[data-testid="task-save"]');
    await grace.locator('[data-testid="task-card"]', { hasText: 'Made while Ada was offline' }).waitFor();
    expect(await ada.locator('[data-testid="task-card"]', { hasText: 'Made while Ada was offline' }).count()).toBe(0);

    // Back online: reconnect, refetch, and the missed task appears.
    await ada.context().setOffline(false);
    await waitOnline(ada);
    await ada.locator('[data-testid="column-review"] [data-testid="task-card"]', { hasText: 'Made while Ada was offline' }).waitFor({ timeout: 15_000 });
    await ada.locator('[data-testid="toast"]', { hasText: 'Back online' }).waitFor();

    // Live events resume on the new connection.
    const card = grace.locator('[data-testid="task-card"]', { hasText: 'Made while Ada was offline' });
    await card.locator('[data-testid="task-move"]').selectOption('done');
    await ada.locator('[data-testid="column-done"] [data-testid="task-card"]', { hasText: 'Made while Ada was offline' }).waitFor();
  }, 90_000);

  test('permissions: viewers cannot edit and non-members are refused', async () => {
    const margaret = await open('margaret');
    await margaret.locator('[data-testid="project-title"]').waitFor();
    expect(await margaret.locator('[data-testid="add-backlog"]').count()).toBe(0);
    expect(await margaret.locator('[data-testid="task-move"]').count()).toBe(0);
    expect(await margaret.locator('[data-testid="task-card"][draggable="true"]').count()).toBe(0);

    const ada = await open('ada');
    const opsId = await projectIdByName(ada, 'Hackathon Ops');
    const alan = await open('alan', { hash: `#/projects/${opsId}` });
    await alan.locator('[data-testid="error-state"]', { hasText: 'No access to this project' }).waitFor();
    expect(await alan.locator('[data-testid="project-link"]').count()).toBe(2); // Mobile App + Vandeputte, never Hackathon Ops
  }, 90_000);

  test('mobile layout: sidebar collapses into a project switcher and the board scrolls horizontally', async () => {
    const page = await open('ada', { viewport: { width: 390, height: 844 } });
    await page.locator('[data-testid="project-title"]').waitFor();
    await page.locator('[data-testid="project-switcher"]').waitFor();
    expect(await page.locator('[data-testid="project-list"]').isVisible()).toBe(false);
    const board = page.locator('[data-testid="board"]');
    const scrollable = await board.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(scrollable).toBe(true);
    await page.selectOption('[data-testid="project-switcher"]', { label: 'Mobile App' });
    await page.locator('[data-testid="project-title"]', { hasText: 'Mobile App' }).waitFor();
  }, 90_000);
});
