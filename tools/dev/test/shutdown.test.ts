import { expect, test } from 'bun:test';
import { createShutdown } from '../src/shutdown.ts';

test('concurrent shutdown callers await the same cleanup', async () => {
  let finishCleanup: (() => void) | undefined;
  let cleanupCalls = 0;
  const shutdown = createShutdown(async (reason, code) => {
    cleanupCalls += 1;
    expect(reason).toBe('api exited');
    expect(code).toBe(1);
    await new Promise<void>((resolve) => { finishCleanup = resolve; });
  });

  const first = shutdown('api exited', 1);
  const second = shutdown('SIGTERM');

  expect(second).toBe(first);
  expect(cleanupCalls).toBe(1);
  finishCleanup?.();
  await Promise.all([first, second]);
});
