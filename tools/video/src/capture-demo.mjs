/**
 * Capture the real SDtrust demo UI from an already running development stack.
 * Run with Node: Bun's Playwright browser launch hung on Windows during production.
 * Requires installed playwright-core 1.63+, Chromium, ffmpeg and ffprobe on PATH.
 */
import { chromium } from 'playwright-core';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';

const { values } = parseArgs({ options: {
  url: { type: 'string' }, out: { type: 'string' }, help: { type: 'boolean', short: 'h' },
} });
if (values.help) {
  console.log(`Usage: node tools/video/src/capture-demo.mjs [--url WEB_URL] [--out DIRECTORY]

Defaults: URL from .local/dev/runtime.json; output tools/video/output/ui-refresh.
Uses the seeded Wanne / Atlas / October 2026 scenario. Does not start or reset a stack.
Writes capture/context_clean.mp4 (15 seconds, 1440x900, 30fps), 2x screenshots,
details/ screenshots and a timestamp manifest. Existing named outputs are replaced.
Set CHROMIUM_PATH for a compatible installed browser. Requires ffmpeg and ffprobe.
The renderer consumes these filenames directly. No application data is edited.`);
  process.exit(0);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const out = resolve(values.out ?? join(root, 'tools/video/output/ui-refresh'));
const capture = join(out, 'capture');
const details = join(out, 'details');
const runtime = values.url ? null : JSON.parse(await readFile(join(root, '.local/dev/runtime.json'), 'utf8'));
const url = new URL(values.url ?? runtime.urls.web);
url.searchParams.set('as', 'wanne');
const size = { width: 1440, height: 900 };
const question = 'Tot wanneer mag Atlas loonmutaties aanleveren?';
const durationMs = 15_000;
const events = [];
const screenshots = [];
let firstFrame;
let lastFrame;
let frames = 0;
let recording = false;
const mark = (name) => events.push({ name, timestamp: Date.now() });
const command = (name, args) => execFileSync(name, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
const captureCommit = command('git', ['rev-parse', 'HEAD']).trim();
const appChanges = command('git', ['status', '--short', '--', 'apps/web', 'apps/api', 'packages']).trim();
command('ffmpeg', ['-version']);
command('ffprobe', ['-version']);
await mkdir(join(capture, 'raw'), { recursive: true });
await mkdir(details, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const context = await browser.newContext({ viewport: size, deviceScaleFactor: 2 });
const page = await context.newPage();
page.setDefaultTimeout(15_000);
const screenshot = async (directory, name) => {
  const path = join(directory, `${name}.png`);
  await page.screenshot({ path });
  const dialog = page.getByRole('dialog');
  screenshots.push({ path: relative(out, path), dialog: await dialog.isVisible() ? await dialog.boundingBox() : null });
};
const snapshot = (name) => page.locator('body').ariaSnapshot().then((text) => writeFile(join(capture, `${name}.txt`), text));
const raw = join(capture, 'raw/context.webm');

try {
  await page.goto(url.href);
  await page.getByTestId('kn-answer').waitFor();
  await page.getByRole('button', { name: 'Vraag Finn', exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1000);
  await screenshot(capture, '01-home');
  await page.getByRole('textbox', { name: 'Stel je vraag' }).fill('');
  await page.mouse.move(1420, 880);
  await page.waitForTimeout(850);
  await screenshot(capture, 'context-empty');

  // Start only on the loaded, empty composer. Frame timestamps share Date.now's epoch.
  // This public API avoids guessing a trim offset from page creation or navigation time.
  await page.screencast.start({ path: raw, size, quality: 100, onFrame: ({ timestamp }) => {
    firstFrame ??= timestamp;
    lastFrame = timestamp;
    frames++;
  } });
  recording = true;
  const frameDeadline = Date.now() + 5000;
  while (firstFrame === undefined && Date.now() < frameDeadline) await page.waitForTimeout(50);
  if (firstFrame === undefined) throw new Error('No screencast frames received.');
  mark('context_start');
  await page.waitForTimeout(1000);
  mark('typing_start');
  await page.getByRole('textbox', { name: 'Stel je vraag' }).pressSequentially(question, { delay: 85 });
  mark('typing_end');
  await page.getByRole('combobox', { name: 'Klant', exact: true }).hover();
  await page.waitForTimeout(1500);
  await screenshot(capture, 'context-question');
  await page.getByRole('button', { name: 'Vraag Finn', exact: true }).hover();
  await page.waitForTimeout(1000);
  mark('submit');
  await page.getByRole('button', { name: 'Vraag Finn', exact: true }).click();
  await page.getByTestId('kn-answer').getByRole('heading', { name: '22 oktober 2026', exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="kn-answer"]')?.getAttribute('aria-busy') === 'false');
  mark('answer_ready');
  await page.mouse.move(1420, 880);
  if (Date.now() - firstFrame > durationMs - 1000) throw new Error('Question took too long to fit the 15 second clip; capture stopped without exporting a truncated interaction.');
  await page.waitForTimeout(Math.max(0, firstFrame + durationMs - Date.now()));
  mark('context_end');
  await page.screencast.stop();
  recording = false;

  await page.getByTestId('kn-answer').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await screenshot(capture, 'answer');
  await snapshot('answer');
  await page.getByText('Waarom deze bron?', { exact: true }).click();
  await page.getByTestId('kn-answer').evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.mouse.wheel(0, -75);
  await page.waitForTimeout(400);
  await screenshot(capture, 'answer-focused');
  await page.getByRole('table', { name: 'Bronnen en beoordeling' }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await screenshot(capture, 'differences');
  await snapshot('differences');

  await page.getByRole('button', { name: 'Bekijk bron', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await page.waitForTimeout(800);
  await screenshot(details, 'atlas-owner-validity-2x');
  await page.getByRole('dialog').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.getByTestId('kn-audience').waitFor();
  await page.waitForTimeout(400);
  await screenshot(details, 'atlas-access-2x');
  await page.getByRole('button', { name: 'Bron sluiten', exact: true }).click();
  await page.getByRole('button', { name: /Algemene procedure België/ }).click();
  await page.getByTestId('kn-versions').scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await screenshot(details, 'procedure-version-chain-2x');
  await page.getByRole('button', { name: 'Bron sluiten', exact: true }).click();
  await page.getByRole('button', { name: 'Vergelijk', exact: true }).click();
  await page.getByTestId('kn-compare').scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await screenshot(capture, 'compare');
  await snapshot('compare');
} finally {
  if (recording) await page.screencast.stop().catch(() => {});
  await context.close();
  await browser.close();
  await writeFile(join(capture, 'timings.json'), JSON.stringify({
    url: url.href, video: relative(out, raw), firstFrame, lastFrame, frames,
    events: events.map((event) => ({ ...event, seconds: (event.timestamp - firstFrame) / 1000 })),
  }, null, 2));
}

const video = join(capture, 'context_clean.mp4');
command('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw,
  '-vf', 'setpts=PTS-STARTPTS,fps=30,tpad=stop_mode=clone:stop_duration=15,setsar=1',
  '-frames:v', '450', '-an', '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', video]);
const metadata = JSON.parse(command('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=width,height,r_frame_rate,nb_frames', '-of', 'json', video]));
const stream = metadata.streams[0];
if (stream.width !== size.width || stream.height !== size.height || stream.nb_frames !== '450' || stream.r_frame_rate !== '30/1' || Number(metadata.format.duration) !== 15) {
  throw new Error(`Unexpected export metadata: ${JSON.stringify(metadata)}`);
}
command('ffmpeg', ['-v', 'error', '-i', video, '-f', 'null', '-']);
await writeFile(join(capture, 'export.json'), JSON.stringify({ captureCommit, appChanges, url: url.href, viewport: size, deviceScaleFactor: 2, question, screenshots, metadata }, null, 2));
console.log(`Captured and decoded 15 seconds of real UI: ${video}`);
