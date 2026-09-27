import type { Subprocess } from 'bun';

export interface ManagedProcess {
  name: string;
  proc: Subprocess<'ignore', 'pipe', 'pipe'>;
  exited: Promise<number>;
}

export interface SpawnOptions {
  name: string;
  cmd: string[];
  cwd: string;
  env: Record<string, string | undefined>;
  onLine: (line: string, stream: 'stdout' | 'stderr') => void;
}

async function pump(stream: ReadableStream<Uint8Array>, onLine: (line: string) => void) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      onLine(buffer.slice(0, index).replace(/\r$/, ''));
      buffer = buffer.slice(index + 1);
    }
  }
  if (buffer) onLine(buffer);
}

/** Spawns a child whose stdout/stderr are streamed line by line to the launcher log. */
export function spawnManaged(options: SpawnOptions): ManagedProcess {
  const proc = Bun.spawn(options.cmd, {
    cwd: options.cwd,
    env: options.env as Record<string, string>,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  void pump(proc.stdout, (line) => options.onLine(line, 'stdout'));
  void pump(proc.stderr, (line) => options.onLine(line, 'stderr'));
  return { name: options.name, proc, exited: proc.exited };
}

/** SIGTERM, then SIGKILL after a grace period. Only ever targets processes this launcher spawned. */
export async function stopManaged(managed: ManagedProcess, graceMs = 5_000): Promise<void> {
  const { proc } = managed;
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  proc.kill('SIGTERM');
  const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), graceMs));
  const result = await Promise.race([proc.exited.then(() => 'exited' as const), timeout]);
  if (result === 'timeout') proc.kill('SIGKILL');
  await proc.exited;
}
