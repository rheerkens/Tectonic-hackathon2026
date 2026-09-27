import { existsSync } from 'node:fs';
import path from 'node:path';

export interface WorktreeInfo {
  /** Absolute path of the worktree root. */
  root: string;
  /** Human-readable name: the directory basename. */
  name: string;
  /** Stable short id derived from the absolute path. */
  id: string;
  /** True when this is the main checkout rather than a linked worktree. */
  isMain: boolean;
  /** Path of the shared `.git` directory (common dir). */
  gitCommonDir: string;
}

async function git(args: string[], cwd: string): Promise<string> {
  const proc = Bun.spawn(['git', ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code !== 0) throw new Error(`git ${args.join(' ')} failed: ${err.trim()}`);
  return out.trim();
}

/** FNV-1a 32-bit hash, used for stable per-path defaults (never for uniqueness guarantees). */
export function hashPath(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export async function resolveWorktree(cwd: string = process.cwd()): Promise<WorktreeInfo> {
  const root = await git(['rev-parse', '--show-toplevel'], cwd);
  const commonDirRaw = await git(['rev-parse', '--git-common-dir'], cwd);
  const gitCommonDir = path.resolve(root, commonDirRaw);
  const gitDir = path.resolve(root, await git(['rev-parse', '--git-dir'], cwd));
  return {
    root,
    name: path.basename(root),
    id: hashPath(root).toString(16).padStart(8, '0'),
    isMain: gitDir === gitCommonDir,
    gitCommonDir,
  };
}

/** Roots of every worktree of the repository (including this one). */
export async function listWorktreeRoots(cwd: string): Promise<string[]> {
  const out = await git(['worktree', 'list', '--porcelain'], cwd);
  return out
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length))
    .filter((p) => existsSync(p));
}

/** Runtime state lives under `<worktree>/.local/<profile>/` which is git-ignored. */
export function localDir(root: string, profile: string): string {
  return path.join(root, '.local', profile);
}
