import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AlreadyRunningError, acquireLock, isProcessAlive, readLock } from '../src/lock.ts';

const tmp = () => path.join(mkdtempSync(path.join(os.tmpdir(), 'tectonic-lock-')), 'dev.lock');

describe('duplicate launch protection', () => {
  test('acquires and releases a lock', () => {
    const file = tmp();
    const release = acquireLock(file, { pid: process.pid, profile: 'dev', root: '/x' });
    expect(readLock(file)?.pid).toBe(process.pid);
    release();
    expect(readLock(file)).toBeNull();
  });

  test('rejects a second launch while the first process is alive', async () => {
    const file = tmp();
    // A real, live process that is not us: a sleeping child.
    const child = Bun.spawn(['sleep', '30']);
    try {
      writeFileSync(file, JSON.stringify({ pid: child.pid, startedAt: new Date().toISOString(), profile: 'dev', root: '/x' }));
      expect(() => acquireLock(file, { pid: process.pid, profile: 'dev', root: '/x' })).toThrow(AlreadyRunningError);
      // The lock file must be untouched by the rejected launch.
      expect(JSON.parse(readFileSync(file, 'utf8')).pid).toBe(child.pid);
    } finally {
      child.kill();
      await child.exited;
    }
  });

  test('replaces a stale lock from a dead process', async () => {
    const file = tmp();
    const child = Bun.spawn(['sleep', '30']);
    const deadPid = child.pid;
    child.kill();
    await child.exited;
    expect(isProcessAlive(deadPid)).toBe(false);
    writeFileSync(file, JSON.stringify({ pid: deadPid, startedAt: '', profile: 'dev', root: '/x' }));
    const release = acquireLock(file, { pid: process.pid, profile: 'dev', root: '/x' });
    expect(readLock(file)?.pid).toBe(process.pid);
    release();
  });

  test('tolerates corrupt lock files', () => {
    const file = tmp();
    writeFileSync(file, 'not json');
    expect(readLock(file)).toBeNull();
    const release = acquireLock(file, { pid: process.pid, profile: 'dev', root: '/x' });
    release();
  });
});
