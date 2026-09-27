/**
 * Records an instructive walkthrough of the real running app.
 *
 *   bun run video                # launch an isolated `video` stack, record at viewer pace
 *   bun run video -- --rehearsal # fast pass (short holds) to catch locator/layout failures
 *   bun run video -- --base-url http://localhost:49000   # reuse a running stack instead
 *   bun run video -- --scenario board-tour --no-mp4
 *
 * Output: tools/video/output/<runId>/ (git-ignored) with video.webm, video.mp4,
 * timeline.json, chapters.json, script.md, frames/, review/ and player.html.
 */
import { ensureStack } from '@tectonic/dev';
import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Locator, type Page } from 'playwright';
import { probeDuration, transcodeMp4 } from './media.ts';
import { Overlay } from './overlay.ts';
import { buildPlayer } from './package-player.ts';
import { reviewRecording } from './review.ts';
import { Clock, Timeline, renderScript } from './timeline.ts';
import type { RecordingManifest, Scenario, Step, StepContext } from './types.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const rehearsal = flag('--rehearsal');
const scenarioName = opt('--scenario') ?? 'board-tour';
const scenarioModule = (await import(path.join(HERE, '../scenarios', `${scenarioName}.ts`))) as { scenario: Scenario };
const scenario = scenarioModule.scenario;

const runId = `${scenario.id}-${rehearsal ? 'rehearsal-' : ''}${new Date().toISOString().replace(/[:.]/g, '-')}`;
const outDir = path.resolve(opt('--out') ?? path.join(HERE, '../output'), runId);
mkdirSync(path.join(outDir, 'frames'), { recursive: true });
const log = (message: string) => console.log(`[video] ${message}`);

log(`scenario "${scenario.title}" (${scenario.steps.length} steps) → ${outDir}${rehearsal ? ' [rehearsal]' : ''}`);
const stack = await ensureStack({ profile: 'video', resetDb: true, baseUrl: opt('--base-url') });
log(`app under test: ${stack.baseUrl}`);

const notes: string[] = [];
const browser = await chromium.launch();
const helperContext = await browser.newContext({ viewport: scenario.viewport });
const helper = await helperContext.newPage();
await helper.goto(`${stack.baseUrl}/?as=${scenario.helperIdentity}`);
await helper.locator('[data-testid="connection-status"][data-status="online"]').waitFor({ timeout: 20_000 });

const context = await browser.newContext({ viewport: scenario.viewport, recordVideo: { dir: outDir, size: scenario.viewport }, colorScheme: 'light' });
const clock = new Clock(); // capture starts when the page is created; anchor the clock just before that
const page = await context.newPage();
let expectedNetworkErrors = 0;
page.on('pageerror', (error) => notes.push(`page error: ${error.message}`));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  // Connection attempts while the scenario simulates an outage are expected and part of the story.
  if (/ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED/.test(m.text())) expectedNetworkErrors += 1;
  else notes.push(`console error: ${m.text()}`);
});
const overlay = new Overlay(page);
const timeline = new Timeline();

await page.goto(`${stack.baseUrl}/?as=${scenario.presenter}`);
await page.locator('[data-testid="connection-status"][data-status="online"]').waitFor({ timeout: 20_000 });
await overlay.install();

const holdScale = rehearsal ? 0.15 : 1;
const ctx: StepContext = {
  page,
  context,
  helper,
  helperContext,
  baseUrl: stack.baseUrl,
  rehearsal,
  hold: (ms) => page.waitForTimeout(Math.max(150, Math.round(ms * holdScale))),
  click: async (target: Locator) => {
    const box = await overlay.measure(target);
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await overlay.cursor(x, y);
    await page.waitForTimeout(rehearsal ? 150 : 650);
    await overlay.ripple(x, y);
    await target.click();
  },
  type: async (target: Locator, text: string) => {
    await ctx.click(target);
    await target.pressSequentially(text, { delay: rehearsal ? 10 : 70 });
  },
  log,
};

async function runStep(step: Step) {
  const event = timeline.begin(step, clock.now());
  log(`${event.startSeconds.toFixed(1).padStart(6)}s  ${step.kind.padEnd(6)} ${step.id}`);
  const shot = async (suffix: string) => {
    const file = `${step.id}${suffix}.png`;
    await page.screenshot({ path: path.join(outDir, 'frames', file) });
    return file;
  };

  if (step.kind === 'view') {
    await overlay.clear();
    await overlay.hideCursor();
    event.screenshot = await shot('');
    await ctx.hold(step.holdMs ?? 4000);
  } else if (step.kind === 'slide') {
    await overlay.slide(step.chapter, step.title ?? '', step.caption, step.closing);
    await page.waitForTimeout(150);
    event.screenshot = await shot('');
    await ctx.hold(step.holdMs ?? 5000);
    await overlay.clear();
  } else {
    const locator = step.target?.(ctx);
    const rect = locator ? await overlay.measure(locator) : null;
    timeline.setTarget(event, rect);
    const placement = await overlay.note({ eyebrow: step.chapter, title: step.title, caption: step.caption, input: step.input, target: rect });
    if (placement.clipped) notes.push(`${step.id}: note text is clipped, shorten the caption`);
    await page.waitForTimeout(150);
    event.screenshot = await shot('');
    await ctx.hold(step.holdMs ?? Math.max(3500, 1800 + step.caption.length * 45));

    if (step.kind === 'action') {
      // Remove the explanation, keep the outline, then perform the real interaction.
      const fresh = locator ? await overlay.measure(locator) : null;
      await overlay.keepTarget(fresh);
      await page.waitForTimeout(rehearsal ? 100 : 400);
      await shot('-before');
      event.actionSeconds = clock.now();
      if (step.act) await step.act(ctx);
      if (step.expect) await step.expect(ctx);
      // The target may have moved (e.g. a card changed column) or disappeared: follow it or drop the outline.
      if (locator) {
        // No auto-waiting here: the element may legitimately be gone (dialog closed, menu dismissed).
        const stillThere = (await locator.count()) > 0 && (await locator.first().isVisible());
        const after = stillThere ? await locator.first().boundingBox({ timeout: 1_000 }).catch(() => null) : null;
        if (!after || after.width === 0) await overlay.keepTarget(null);
        else if (!fresh || Math.abs(after.x - fresh.x) > 1 || Math.abs(after.y - fresh.y) > 1) await overlay.keepTarget(after);
      }
      await page.waitForTimeout(rehearsal ? 100 : 500);
      await shot('-after');
      await ctx.hold(Math.min(step.holdMs ?? 3000, 3000));
    }
    await overlay.clear();
  }
  event.endSeconds = clock.now();
}

let failure: unknown = null;
try {
  for (const step of scenario.steps) await runStep(step);
  await overlay.hideCursor();
} catch (error) {
  failure = error;
  notes.push(`FAILED at step ${timeline.events.at(-1)?.id}: ${error instanceof Error ? error.message : String(error)}`);
  log(`step failed: ${String(error)}`);
}

const expectedSeconds = clock.now();
if (expectedNetworkErrors > 0) notes.push(`${expectedNetworkErrors} expected WebSocket connection errors while the outage was simulated`);
await page.close();
await context.close();
const video = page.video();
const rawPath = video ? await video.path() : null;
await helperContext.close();
await browser.close();
await stack.stop();

const webm = 'video.webm';
if (rawPath && existsSync(rawPath)) {
  const { renameSync } = await import('node:fs');
  renameSync(rawPath, path.join(outDir, webm));
} else {
  notes.push('Playwright produced no video file');
}

const durationSeconds = await probeDuration(path.join(outDir, webm));
let mp4: string | null = null;
if (!flag('--no-mp4') && !rehearsal && (await transcodeMp4(path.join(outDir, webm), path.join(outDir, 'video.mp4')))) mp4 = 'video.mp4';

const manifest: RecordingManifest = {
  runId,
  scenario: scenario.id,
  rehearsal,
  recordedAt: new Date().toISOString(),
  viewport: scenario.viewport,
  baseUrl: stack.baseUrl,
  video: {
    webm,
    mp4,
    durationSeconds,
    expectedSeconds: Number(expectedSeconds.toFixed(3)),
    driftSeconds: durationSeconds === null ? null : Number((durationSeconds - expectedSeconds).toFixed(3)),
  },
  chapters: timeline.chapters,
  events: timeline.events,
  player: null,
  notes,
};
if (manifest.video.driftSeconds !== null && Math.abs(manifest.video.driftSeconds) > 1.5) {
  notes.push(`encoded duration differs from the capture clock by ${manifest.video.driftSeconds}s; check chapter alignment`);
}

writeFileSync(path.join(outDir, 'chapters.json'), JSON.stringify(timeline.chapters, null, 2));
writeFileSync(path.join(outDir, 'script.md'), renderScript({ title: scenario.title, audience: scenario.audience, language: scenario.language, baseUrl: stack.baseUrl, runId, rehearsal, events: timeline.events, duration: durationSeconds, notes }));
writeFileSync(path.join(outDir, 'timeline.json'), JSON.stringify(manifest, null, 2));

if (!rehearsal && !failure && existsSync(path.join(outDir, webm))) {
  try {
    const poster = path.join(outDir, 'frames', `${scenario.steps[0]?.id}.png`);
    const html = buildPlayer({ video: path.join(outDir, webm), chapters: timeline.chapters, title: scenario.title, language: scenario.language, poster: existsSync(poster) ? poster : undefined });
    writeFileSync(path.join(outDir, 'player.html'), html);
    manifest.player = 'player.html';
  } catch (error) {
    notes.push(`player packaging failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

let review: Awaited<ReturnType<typeof reviewRecording>> | null = null;
if (!failure) {
  try {
    review = await reviewRecording(outDir);
    for (const w of review.warnings) notes.push(w);
  } catch (error) {
    notes.push(`review extraction failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
writeFileSync(path.join(outDir, 'timeline.json'), JSON.stringify(manifest, null, 2));

const latest = path.join(path.dirname(outDir), 'latest');
rmSync(latest, { force: true });
try {
  symlinkSync(outDir, latest, 'dir');
} catch {
  /* symlinks may be unavailable (Windows without privileges) */
}

log('');
log(`output      ${outDir}`);
log(`video       ${webm}${mp4 ? ` + ${mp4}` : ''}  (${durationSeconds === null ? 'duration unknown' : `${durationSeconds.toFixed(1)}s`}, capture clock ${expectedSeconds.toFixed(1)}s)`);
log(`timeline    timeline.json, chapters.json, script.md, frames/${review ? `, review/ (${review.frames.length} frames, decoded ${review.decodedFrames ?? 'n/a'})` : ''}`);
if (manifest.player) log(`player      player.html (offline, single file)`);
if (notes.length) {
  log('notes:');
  for (const n of notes) log(`  - ${n}`);
}
if (failure) process.exit(1);
