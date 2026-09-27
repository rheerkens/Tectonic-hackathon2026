import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface StackHandle {
  baseUrl: string;
  apiUrl: string;
  /** Stops the stack if this process started it. */
  stop(): Promise<void>;
}

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/**
 * Returns a running stack for browser tests and recordings. When `baseUrl` (or
 * E2E_BASE_URL) is given the caller targets that already-running stack;
 * otherwise an isolated stack is launched under `profile` with a freshly seeded
 * database, so the developer's own `dev` profile data is never touched.
 */
export async function ensureStack(options: { profile?: string; resetDb?: boolean; baseUrl?: string } = {}): Promise<StackHandle> {
  const preset = (options.baseUrl ?? process.env.E2E_BASE_URL)?.trim();
  if (preset) {
    const runtime = readRuntime('dev');
    return { baseUrl: preset.replace(/\/$/, ''), apiUrl: runtime?.urls.api ?? preset, stop: async () => {} };
  }

  const profile = options.profile ?? 'e2e';
  const proc = Bun.spawn(['bun', path.join(REPO_ROOT, 'tools/dev/src/cli.ts'), 'up', '--profile', profile, ...(options.resetDb === false ? [] : ['--reset-db'])], {
    cwd: REPO_ROOT,
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

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) throw new Error(`dev stack exited early (code ${proc.exitCode}):\n${output}`);
    const runtime = readRuntime(profile);
    if (runtime?.status === 'ready' && runtime.launcherPid === proc.pid) {
      return {
        baseUrl: runtime.urls.web,
        apiUrl: runtime.urls.api,
        stop: async () => {
          proc.kill('SIGTERM');
          await Promise.race([proc.exited, Bun.sleep(20_000)]);
          if (proc.exitCode === null) proc.kill('SIGKILL');
        },
      };
    }
    if (runtime?.status === 'failed' && runtime.launcherPid === proc.pid) {
      throw new Error(`dev stack failed to start: ${runtime.error}\n${output}`);
    }
    await Bun.sleep(250);
  }
  proc.kill('SIGKILL');
  throw new Error(`dev stack did not become ready in time:\n${output}`);
}

interface RuntimeFile {
  status: string;
  launcherPid: number;
  urls: { web: string; api: string };
  error?: string;
}

export function readRuntime(profile: string): RuntimeFile | null {
  const file = path.join(REPO_ROOT, '.local', profile, 'runtime.json');
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as RuntimeFile;
  } catch {
    return null;
  }
}
