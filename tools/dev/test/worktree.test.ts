import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hashPath, listWorktreeRoots, localDir, resolveWorktree } from '../src/worktree.ts';

async function run(cmd: string[], cwd: string) {
  const proc = Bun.spawn(cmd, { cwd, stdout: 'pipe', stderr: 'pipe' });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`${cmd.join(' ')} failed: ${await new Response(proc.stderr).text()}`);
}

describe('worktree isolation', () => {
  test('each worktree resolves to its own root, id and .local directory', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'tectonic-wt-'));
    const main = path.join(dir, 'main');
    await run(['git', 'init', '-q', '-b', 'main', main], dir);
    await run(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init'], main);
    const feature = path.join(dir, 'feature');
    await run(['git', 'worktree', 'add', '-q', '-b', 'feature', feature], main);

    const a = await resolveWorktree(main);
    const b = await resolveWorktree(path.join(feature)); // works from any directory inside the worktree
    expect(a.root).toBe(main);
    expect(b.root).toBe(feature);
    expect(a.isMain).toBe(true);
    expect(b.isMain).toBe(false);
    expect(a.id).not.toBe(b.id);
    expect(localDir(a.root, 'dev')).toBe(path.join(main, '.local', 'dev'));
    expect(localDir(b.root, 'dev')).toBe(path.join(feature, '.local', 'dev'));
    expect(localDir(a.root, 'e2e')).not.toBe(localDir(a.root, 'dev'));

    const roots = await listWorktreeRoots(feature);
    expect(roots.sort()).toEqual([feature, main].sort());
  });

  test('hashPath is deterministic', () => {
    expect(hashPath('/a/b')).toBe(hashPath('/a/b'));
    expect(hashPath('/a/b')).not.toBe(hashPath('/a/c'));
  });
});
