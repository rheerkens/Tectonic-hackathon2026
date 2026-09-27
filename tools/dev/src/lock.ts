import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface LockInfo {
  pid: number;
  startedAt: string;
  profile: string;
  root: string;
}

export class AlreadyRunningError extends Error {
  constructor(readonly lock: LockInfo) {
    super(`A dev stack for this worktree is already running (pid ${lock.pid}, started ${lock.startedAt}).`);
    this.name = 'AlreadyRunningError';
  }
}

export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function readLock(file: string): LockInfo | null {
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<LockInfo>;
    if (typeof parsed.pid !== 'number') return null;
    return { pid: parsed.pid, startedAt: parsed.startedAt ?? '', profile: parsed.profile ?? 'dev', root: parsed.root ?? '' };
  } catch {
    return null;
  }
}

/**
 * Creates the lock file for this worktree+profile. Throws AlreadyRunningError
 * when a live process owns it; silently replaces stale locks from dead processes.
 */
export function acquireLock(file: string, info: Omit<LockInfo, 'startedAt'>): () => void {
  const existing = readLock(file);
  if (existing && existing.pid !== process.pid && isProcessAlive(existing.pid)) {
    throw new AlreadyRunningError(existing);
  }
  mkdirSync(path.dirname(file), { recursive: true });
  const lock: LockInfo = { ...info, startedAt: new Date().toISOString() };
  writeFileSync(file, JSON.stringify(lock, null, 2));
  return () => {
    const current = readLock(file);
    if (current && current.pid === info.pid) rmSync(file, { force: true });
  };
}
