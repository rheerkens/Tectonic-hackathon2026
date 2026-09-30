/**
 * Records the agent-activity animations (apps/web/src/agent-activity) as short looping mp4 clips.
 *
 *   bun run dev                                   # in this worktree, in another terminal
 *   bun run video:snippets                        # all scenes
 *   bun run video:snippets teams outlook          # only these
 *   bun run video:snippets --url http://host:port # override the web URL from .local/dev/runtime.json
 *
 * Output: tools/video/output/snippets/<scene>.mp4 (git-ignored), exactly one loop long.
 */
import { chromium } from 'playwright-core';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../../..');
const OUT = join(ROOT, 'tools/video/output/snippets');
const VIEWPORT = { width: 1440, height: 900 };

const args = process.argv.slice(2);
const urlFlag = args.indexOf('--url');
const baseUrl = urlFlag >= 0 ? args[urlFlag + 1]! : await webUrlFromRuntime();
const requested = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--url');

async function webUrlFromRuntime(): Promise<string> {
  try {
    const runtime = JSON.parse(await readFile(join(ROOT, '.local/dev/runtime.json'), 'utf8'));
    return runtime.urls.web;
  } catch {
    throw new Error('No running stack found. Start `bun run dev` first, or pass --url <web url>.');
  }
}

async function run(cmd: string[]) {
  const proc = Bun.spawn(cmd, { stdout: 'ignore', stderr: 'pipe' });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`${cmd[0]} failed (${code}): ${await new Response(proc.stderr).text()}`);
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
try {
  // The page lists its own scenes, so this tool never has to know them.
  const probe = await browser.newPage({ viewport: VIEWPORT });
  await probe.goto(`${baseUrl}/agent-activity`);
  const all = await probe.$$eval('.aa-gallery-grid code', (els) => els.map((e) => e.textContent!.replace('?scene=', '')));
  await probe.close();

  const scenes = requested.length > 0 ? requested : all;
  const unknown = scenes.filter((s) => !all.includes(s));
  if (unknown.length > 0) throw new Error(`Unknown scene(s): ${unknown.join(', ')}. Available: ${all.join(', ')}`);

  await mkdir(OUT, { recursive: true });
  for (const scene of scenes) {
    const tmp = join(OUT, `.${scene}-raw`);
    await rm(tmp, { recursive: true, force: true });

    const context = await browser.newContext({ viewport: VIEWPORT, recordVideo: { dir: tmp, size: VIEWPORT } });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/agent-activity?scene=${scene}`);
    await page.locator('.aa[data-ready="true"]').waitFor();
    const loopMs = Number(await page.locator('.aa').getAttribute('data-loop-ms'));
    // A continuous periodic scene can be cut at ANY phase. Keep one complete loop
    // from the fully loaded tail, with a second of padding before browser close.
    await page.waitForTimeout(loopMs + 3000);
    await page.close();
    await context.close();

    const raw = await page.video()!.path();
    const out = join(OUT, `${scene}.mp4`);
    await run([
      'ffmpeg', '-y', '-loglevel', 'error', '-sseof', String(-(loopMs / 1000 + 1)), '-i', raw, '-vf', 'fps=30,setpts=PTS-STARTPTS', '-frames:v', String(loopMs / 1000 * 30),
      '-an', '-r', '30', '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out,
    ]);
    await run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', '2', '-i', out, '-frames:v', '1', '-q:v', '2', join(OUT, `${scene}.jpg`)]);
    await rm(tmp, { recursive: true, force: true });
    console.log(`${scene.padEnd(11)} ${(loopMs / 1000).toFixed(1)}s  ${out}`);
  }
} finally {
  await browser.close();
}
