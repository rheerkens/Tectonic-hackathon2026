/**
 * Runs the Tauri CLI against the current dev stack.
 *
 *   bun run desktop:dev    -> `tauri dev` pointed at this worktree's Vite URL (from .local/dev/runtime.json)
 *   bun run --cwd apps/desktop build -> `tauri build` bundling apps/web/dist
 *
 * Prerequisites (not installed in CI or on the hackathon dev box): Rust toolchain
 * and the Tauri system dependencies. See docs/mobile-desktop.md.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const [command = 'dev', ...rest] = process.argv.slice(2);

const args = [command, ...rest];
if (command === 'dev') {
  const runtimeFile = path.join(repoRoot, '.local', process.env.DEV_PROFILE ?? 'dev', 'runtime.json');
  if (!existsSync(runtimeFile)) {
    console.error('No running dev stack found. Start it first in another terminal: bun run dev');
    process.exit(1);
  }
  const runtime = JSON.parse(readFileSync(runtimeFile, 'utf8')) as { status: string; urls: { web: string } };
  if (runtime.status !== 'ready') {
    console.error(`Dev stack is "${runtime.status}", not ready. Start it with: bun run dev`);
    process.exit(1);
  }
  args.push('--config', JSON.stringify({ build: { devUrl: runtime.urls.web } }));
  console.log(`Tauri dev window will load ${runtime.urls.web}`);
}

const proc = Bun.spawn(['bunx', '@tauri-apps/cli', ...args], { cwd: path.resolve(here, '..'), stdio: ['inherit', 'inherit', 'inherit'] });
process.exit(await proc.exited);
