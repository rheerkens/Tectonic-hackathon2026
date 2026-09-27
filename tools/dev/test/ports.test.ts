import { describe, expect, test } from 'bun:test';
import net from 'node:net';
import { PORT_RANGE, allocatePorts, isPortFree } from '../src/ports.ts';
import { hashPath } from '../src/worktree.ts';

async function occupy(port: number, host = '127.0.0.1'): Promise<() => Promise<void>> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  return () => new Promise((resolve) => server.close(() => resolve()));
}

describe('port allocation', () => {
  test('different worktree paths start from different blocks, but the hash is only a hint', () => {
    const a = hashPath('/home/dev/repo');
    const b = hashPath('/home/dev/repo-feature');
    expect(a).not.toBe(b);
  });

  test('skips ports that are actually in use, even when the hash points at them', async () => {
    const seed = 42;
    const first = await allocatePorts({ seed });
    const release = await occupy(first.web);
    try {
      const second = await allocatePorts({ seed });
      expect(second.web).not.toBe(first.web);
      expect(second.web).toBeGreaterThan(first.web);
      expect(await isPortFree(first.web)).toBe(false);
    } finally {
      await release();
    }
  });

  test('a loopback-only listener still counts as a collision for the wildcard bind', async () => {
    const seed = 7;
    const ports = await allocatePorts({ seed });
    const release = await occupy(ports.api, '127.0.0.1');
    try {
      const next = await allocatePorts({ seed });
      expect(next.api).not.toBe(ports.api);
    } finally {
      await release();
    }
  });

  test('reuses previously recorded ports when they are free', async () => {
    const preferred = { web: 23456, api: 23457, postgres: 23458 };
    const probe = async () => true;
    expect(await allocatePorts({ seed: 1, preferred, probe })).toEqual(preferred);
  });

  test('abandons recorded ports when one of them is busy and keeps the block contiguous', async () => {
    const preferred = { web: 23456, api: 23457, postgres: 23458 };
    const busy = new Set([23457]);
    const probe = async (port: number) => !busy.has(port);
    const ports = await allocatePorts({ seed: 1, preferred, probe });
    expect(ports).not.toEqual(preferred);
    expect(ports.api).toBe(ports.web + 1);
    expect(ports.postgres).toBe(ports.web + 2);
  });

  test('ports reserved by other worktrees are never handed out', async () => {
    const seed = 1;
    const probe = async () => true;
    const base = await allocatePorts({ seed, probe });
    const next = await allocatePorts({ seed, probe, reserved: [base.web, base.api, base.postgres] });
    expect(next.web).toBe(base.web + 10);
  });

  test('stays inside the configured range', async () => {
    const probe = async () => true;
    for (const seed of [0, 1, 999_999, 2 ** 32 - 1]) {
      const ports = await allocatePorts({ seed, probe });
      expect(ports.web).toBeGreaterThanOrEqual(PORT_RANGE.min);
      expect(ports.postgres).toBeLessThanOrEqual(PORT_RANGE.max);
    }
  });

  test('fails clearly when nothing is free', async () => {
    await expect(allocatePorts({ seed: 1, probe: async () => false, maxAttempts: 5 })).rejects.toThrow(/free ports/);
  });
});
