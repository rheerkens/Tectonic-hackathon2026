/**
 * Integration test: two worktrees of this repository run their own stacks at
 * the same time, with different ports, data directories and lock files, and
 * stopping one leaves the other untouched. Needs the launcher to be committed
 * (it creates a temporary `git worktree` from HEAD); skips otherwise.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, realpathSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CLI = 'tools/dev/src/cli.ts';
const PROFILE = 'isolation-test';

async function sh(cmd: string[], cwd: string): Promise<{ code: number; out: string }> {
  const proc = Bun.spawn(cmd, { cwd, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { code, out: stdout + stderr };
}

interface Runtime {
  status: string;
  launcherPid: number;
  ports: { web: number; api: number; postgres: number };
  paths: { postgresData: string; lock: string };
  worktree: { root: string };
  urls: { apiHealth: string };
}

function startStack(root: string) {
  const proc = Bun.spawn(['bun', path.join(REPO_ROOT, CLI), 'up', '--profile', PROFILE, '--api-only', '--reset-db'], {
    cwd: root,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  let output = '';
  const capture = async (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      output += decoder.decode(value, { stream: true });
    }
  };
  void capture(proc.stdout);
  void capture(proc.stderr);
  const runtimeFile = path.join(root, '.local', PROFILE, 'runtime.json');
  return {
    proc,
    runtimeFile,
    output: () => output,
    async ready(): Promise<Runtime> {
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        if (proc.exitCode !== null) throw new Error(`launcher exited (${proc.exitCode}): ${output}`);
        if (existsSync(runtimeFile)) {
          const runtime = JSON.parse(readFileSync(runtimeFile, 'utf8')) as Runtime;
          if (runtime.status === 'ready' && runtime.launcherPid === proc.pid) return runtime;
          if (runtime.status === 'failed' && runtime.launcherPid === proc.pid) throw new Error(`launcher failed: ${output}`);
        }
        await Bun.sleep(200);
      }
      throw new Error(`launcher not ready in time: ${output}`);
    },
    async stop() {
      proc.kill('SIGTERM');
      await Promise.race([proc.exited, Bun.sleep(20_000)]);
      if (proc.exitCode === null) proc.kill('SIGKILL');
    },
  };
}

const healthy = async (url: string) => (await fetch(url).catch(() => null))?.ok === true;

describe('worktree isolation (integration)', () => {
  test(
    'two worktrees run independent stacks and stop independently',
    async () => {
      const tmp = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'tectonic-wt-iso-')));
      const worktree = path.join(tmp, 'feature');
      const added = await sh(['git', 'worktree', 'add', '--detach', worktree, 'HEAD'], REPO_ROOT);
      if (added.code !== 0 || !existsSync(path.join(worktree, CLI))) {
        console.warn('skipping: launcher is not committed yet (git worktree from HEAD lacks tools/dev)');
        await sh(['git', 'worktree', 'remove', '--force', worktree], REPO_ROOT).catch(() => {});
        rmSync(tmp, { recursive: true, force: true });
        return;
      }
      let main: ReturnType<typeof startStack> | undefined;
      let other: ReturnType<typeof startStack> | undefined;
      try {
        const install = await sh(['bun', 'install', '--frozen-lockfile'], worktree);
        expect(install.code).toBe(0);

        main = startStack(REPO_ROOT);
        other = startStack(worktree);
        const [a, b] = await Promise.all([main.ready(), other.ready()]);

        // Distinct identities, ports, data and locks.
        expect(a.worktree.root).not.toBe(b.worktree.root);
        expect(new Set([a.ports.web, a.ports.api, a.ports.postgres, b.ports.web, b.ports.api, b.ports.postgres]).size).toBe(6);
        expect(a.paths.postgresData.startsWith(REPO_ROOT)).toBe(true);
        expect(b.paths.postgresData.startsWith(worktree)).toBe(true);
        expect(a.paths.lock).not.toBe(b.paths.lock);
        expect(await healthy(a.urls.apiHealth)).toBe(true);
        expect(await healthy(b.urls.apiHealth)).toBe(true);

        // A second launch in the same worktree is rejected while the first runs.
        const dup = await sh(['bun', CLI, 'up', '--profile', PROFILE, '--api-only'], worktree);
        expect(dup.code).toBe(3);
        expect(dup.out).toMatch(/already running/);
        expect(await healthy(b.urls.apiHealth)).toBe(true);

        // Stopping the worktree stack leaves the main stack running.
        await other.stop();
        expect(await healthy(b.urls.apiHealth)).toBe(false);
        expect(await healthy(a.urls.apiHealth)).toBe(true);
        expect(JSON.parse(readFileSync(other.runtimeFile, 'utf8')).status).toBe('stopped');
        await main.stop();
        expect(await healthy(a.urls.apiHealth)).toBe(false);
      } finally {
        await Promise.all([main?.stop(), other?.stop()]);
        await sh(['git', 'worktree', 'remove', '--force', worktree], REPO_ROOT).catch(() => {});
        rmSync(tmp, { recursive: true, force: true });
        rmSync(path.join(REPO_ROOT, '.local', PROFILE), { recursive: true, force: true });
      }
    },
    180_000,
  );
});
