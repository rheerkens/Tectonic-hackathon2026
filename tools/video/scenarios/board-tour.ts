/**
 * Editable walkthrough script for the task board. Each step has a stable id,
 * an exact caption, the real UI target, the exact synthetic input and the
 * expected visible result. Change text here; the recorder, timeline, review
 * frames and player are generated from it.
 */
import type { Scenario, StepContext } from '../src/types.ts';

const online = (page: StepContext['page']) => page.locator('[data-testid="connection-status"][data-status="online"]');
const card = (page: StepContext['page'], title: string) => page.locator('[data-testid="task-card"]', { hasText: title });

const TASK_TITLE = 'Record the demo video';

export const scenario: Scenario = {
  id: 'board-tour',
  title: 'Tectonic Board: a tour of the shared task board',
  description: 'What the board is, how a task is created, how changes from another person appear live, what happens when the connection drops, and what viewers can do.',
  audience: 'Hackathon team members and reviewers seeing the app for the first time',
  language: 'en',
  viewport: { width: 1920, height: 1080 },
  presenter: 'ada',
  helperIdentity: 'grace',
  steps: [
    // ---- Introduction ------------------------------------------------------
    { id: 'intro-view', chapter: 'Introduction', kind: 'view', caption: 'Full app, unobstructed.', holdMs: 4000 },
    {
      id: 'intro-purpose',
      chapter: 'Introduction',
      kind: 'note',
      title: 'A shared task board',
      caption: 'Tectonic Board is a task board for a team. Every change is saved on the server and pushed live to everyone looking at the same project. Ada is signed in with a local demo identity.',
      holdMs: 7500,
    },
    {
      id: 'intro-projects',
      chapter: 'Introduction',
      kind: 'note',
      caption: 'The sidebar lists the projects you belong to, how many tasks are done, and your role in each one.',
      target: (ctx) => ctx.page.locator('[data-testid="project-list"]'),
      holdMs: 5500,
    },
    {
      id: 'intro-columns',
      chapter: 'Introduction',
      kind: 'note',
      caption: 'Tasks move through four columns: Backlog, In progress, Review and Done. Each card shows its priority and who it is assigned to.',
      target: (ctx) => ctx.page.locator('[data-testid="board"]'),
      holdMs: 6000,
    },
    {
      id: 'intro-live',
      chapter: 'Introduction',
      kind: 'note',
      caption: 'The Live badge shows the realtime connection. The avatars next to it show who else is viewing this project right now.',
      target: (ctx) => ctx.page.locator('.topbar-actions'),
      holdMs: 5500,
    },

    // ---- Scenario 1: create a task ----------------------------------------
    {
      id: 'create-title',
      chapter: 'Create a task',
      kind: 'slide',
      title: 'Scenario 1: Create a task',
      caption: 'Ada adds a new task to the Backlog column. The task is stored in the database and appears on every connected screen.',
      holdMs: 5000,
    },
    {
      id: 'create-open',
      chapter: 'Create a task',
      kind: 'action',
      caption: 'Ada clicks the plus button in the Backlog column header. This opens the new-task form.',
      target: (ctx) => ctx.page.locator('[data-testid="add-backlog"]'),
      actor: 'Ada',
      expected: 'The "New task" dialog opens',
      act: (ctx) => ctx.click(ctx.page.locator('[data-testid="add-backlog"]')),
      expect: (ctx) => ctx.page.locator('[data-testid="task-dialog"]').waitFor(),
    },
    {
      id: 'create-type-title',
      chapter: 'Create a task',
      kind: 'action',
      caption: 'She types the title into the Title field.',
      input: TASK_TITLE,
      target: (ctx) => ctx.page.locator('[data-testid="task-title"]'),
      actor: 'Ada (keyboard)',
      expected: 'The title is visible in the field',
      act: (ctx) => ctx.type(ctx.page.locator('[data-testid="task-title"]'), TASK_TITLE),
      expect: async (ctx) => {
        const value = await ctx.page.locator('[data-testid="task-title"]').inputValue();
        if (value !== TASK_TITLE) throw new Error(`title field holds "${value}"`);
      },
    },
    {
      id: 'create-priority',
      chapter: 'Create a task',
      kind: 'action',
      caption: 'Then she sets the priority to High using the Priority dropdown.',
      input: 'High',
      target: (ctx) => ctx.page.locator('[data-testid="task-priority"]'),
      actor: 'Ada',
      expected: 'Priority shows High',
      act: async (ctx) => {
        await ctx.click(ctx.page.locator('[data-testid="task-priority"]'));
        await ctx.page.locator('[data-testid="task-priority"]').selectOption('high');
      },
      expect: async (ctx) => {
        const value = await ctx.page.locator('[data-testid="task-priority"]').inputValue();
        if (value !== 'high') throw new Error(`priority is "${value}"`);
      },
    },
    {
      id: 'create-save',
      chapter: 'Create a task',
      kind: 'action',
      caption: 'Create task saves it. The dialog closes and the new card appears at the bottom of Backlog with a confirmation.',
      target: (ctx) => ctx.page.locator('[data-testid="task-save"]'),
      actor: 'Ada',
      expected: 'Card "Record the demo video" is in Backlog; toast "Task created"',
      act: (ctx) => ctx.click(ctx.page.locator('[data-testid="task-save"]')),
      expect: async (ctx) => {
        await ctx.page.locator('[data-testid="column-backlog"] [data-testid="task-card"]', { hasText: TASK_TITLE }).waitFor();
        await ctx.page.locator('[data-testid="toast"]', { hasText: 'Task created' }).waitFor();
      },
      holdMs: 3500,
    },

    // ---- Scenario 2: live updates from another session ---------------------
    {
      id: 'live-title',
      chapter: 'Live updates',
      kind: 'slide',
      title: 'Scenario 2: Live updates from another session',
      caption: 'Grace has the same project open in her own browser. When she moves a task, Ada sees it happen without refreshing.',
      holdMs: 5500,
    },
    {
      id: 'live-explain',
      chapter: 'Live updates',
      kind: 'action',
      caption: 'Off screen, Grace drags the new task from Backlog to Review in her browser. Watch this card: it moves, flashes, and a notification names who changed it.',
      target: (ctx) => card(ctx.page, TASK_TITLE),
      actor: 'Grace, in a second browser session (not shown)',
      offscreen: 'Helper session selects "Review" in the task card\'s Move dropdown',
      expected: 'The card is now in the Review column with a highlight; toast "Grace Hopper moved … to Review"',
      holdMs: 6500,
      act: async (ctx) => {
        const helperCard = card(ctx.helper, TASK_TITLE);
        await helperCard.waitFor();
        await helperCard.locator('[data-testid="task-move"]').selectOption('review');
      },
      expect: async (ctx) => {
        await ctx.page.locator('[data-testid="column-review"] [data-testid="task-card"]', { hasText: TASK_TITLE }).waitFor();
        await ctx.page.locator('[data-testid="toast"]', { hasText: 'moved' }).waitFor();
      },
    },
    {
      id: 'live-presence',
      chapter: 'Live updates',
      kind: 'note',
      caption: 'Grace also shows up here as a viewer of the project. Presence is derived from the open realtime connections, not stored.',
      target: (ctx) => ctx.page.locator('[data-testid="presence"]'),
      holdMs: 5000,
    },

    // ---- Scenario 3: reconnecting ------------------------------------------
    {
      id: 'reconnect-title',
      chapter: 'Reconnecting',
      kind: 'slide',
      title: 'Scenario 3: Losing and regaining the connection',
      caption: 'The network drops for Ada while Grace keeps working. When Ada is back online the board reconnects and reloads what it missed.',
      holdMs: 5500,
    },
    {
      id: 'reconnect-offline',
      chapter: 'Reconnecting',
      kind: 'action',
      caption: 'Ada\'s network goes away (simulated). The badge changes from Live to Reconnecting while the app retries in the background.',
      target: (ctx) => ctx.page.locator('[data-testid="connection-status"]'),
      actor: 'Simulated network outage',
      offscreen: 'The recorder puts Ada\'s browser context offline',
      expected: 'Badge reads "Reconnecting"',
      act: (ctx) => ctx.context.setOffline(true),
      expect: (ctx) => ctx.page.locator('[data-testid="connection-status"][data-status="reconnecting"]').waitFor({ timeout: 20_000 }),
      holdMs: 4500,
    },
    {
      id: 'reconnect-grace',
      chapter: 'Reconnecting',
      kind: 'action',
      caption: 'Meanwhile Grace marks the task Done. Ada\'s board does not know yet: the card is still in Review.',
      target: (ctx) => card(ctx.page, TASK_TITLE),
      actor: 'Grace (second session)',
      offscreen: 'Helper session selects "Done" in the Move dropdown',
      expected: 'Nothing changes on Ada\'s screen',
      act: async (ctx) => {
        await card(ctx.helper, TASK_TITLE).locator('[data-testid="task-move"]').selectOption('done');
        await ctx.helper.locator('[data-testid="column-done"] [data-testid="task-card"]', { hasText: TASK_TITLE }).waitFor();
      },
      expect: async (ctx) => {
        const still = await ctx.page.locator('[data-testid="column-review"] [data-testid="task-card"]', { hasText: TASK_TITLE }).count();
        if (still !== 1) throw new Error('card unexpectedly moved while offline');
      },
      holdMs: 4500,
    },
    {
      id: 'reconnect-online',
      chapter: 'Reconnecting',
      kind: 'action',
      caption: 'The network is back. The app reconnects, shows "Back online", reloads the project and the task now appears in Done.',
      target: (ctx) => ctx.page.locator('[data-testid="connection-status"]'),
      actor: 'Simulated network recovery',
      offscreen: 'The recorder puts the browser context back online',
      expected: 'Badge reads "Live"; the card is in Done; toast "Back online"',
      act: (ctx) => ctx.context.setOffline(false),
      expect: async (ctx) => {
        await online(ctx.page).waitFor({ timeout: 20_000 });
        await ctx.page.locator('[data-testid="column-done"] [data-testid="task-card"]', { hasText: TASK_TITLE }).waitFor({ timeout: 20_000 });
      },
      holdMs: 5000,
    },

    // ---- Scenario 4: permissions -------------------------------------------
    {
      id: 'perm-title',
      chapter: 'Permissions',
      kind: 'slide',
      title: 'Scenario 4: Roles and permissions',
      caption: 'Members have a role per project. Margaret is a viewer on this project: she can read the board but not change it.',
      holdMs: 5000,
    },
    {
      id: 'perm-menu',
      chapter: 'Permissions',
      kind: 'action',
      caption: 'In local development you can switch demo identities from the user menu. Ada opens it to continue as Margaret.',
      target: (ctx) => ctx.page.locator('[data-testid="user-menu"]'),
      actor: 'Ada',
      expected: 'The identity menu opens',
      act: (ctx) => ctx.click(ctx.page.locator('[data-testid="user-menu"]')),
      expect: (ctx) => ctx.page.locator('[data-testid="switch-margaret"]').waitFor(),
    },
    {
      id: 'perm-switch',
      chapter: 'Permissions',
      kind: 'action',
      caption: 'Choosing Margaret Hamilton reloads the board with her permissions. This tab is now Margaret.',
      target: (ctx) => ctx.page.locator('[data-testid="switch-margaret"]'),
      actor: 'Ada → Margaret',
      expected: 'Header shows Margaret; no add buttons or move dropdowns on the board',
      act: (ctx) => ctx.click(ctx.page.locator('[data-testid="switch-margaret"]')),
      expect: async (ctx) => {
        await ctx.page.locator('[data-testid="user-menu"]', { hasText: 'Margaret Hamilton' }).waitFor();
        await online(ctx.page).waitFor({ timeout: 20_000 });
        await ctx.page.locator('[data-testid="project-title"]').waitFor();
        if ((await ctx.page.locator('[data-testid="add-backlog"]').count()) !== 0) throw new Error('viewer still sees add button');
      },
      holdMs: 3500,
    },
    {
      id: 'perm-viewer',
      chapter: 'Permissions',
      kind: 'note',
      caption: 'As a viewer, Margaret sees the same live board but no plus buttons, no Move dropdowns and no drag handles. The server enforces the same rule on every request and on realtime subscriptions.',
      target: (ctx) => ctx.page.locator('[data-testid="board"]'),
      holdMs: 7000,
    },

    // ---- Closing -----------------------------------------------------------
    {
      id: 'closing',
      chapter: 'Closing',
      kind: 'slide',
      title: 'That is the board',
      caption: 'Tasks persist on the server, every open session sees changes live, dropped connections catch up automatically, and roles are enforced end to end. To run it yourself: bun install, then bun run dev.',
      holdMs: 7000,
      closing: true,
    },
  ],
};
