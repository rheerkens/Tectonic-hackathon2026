/**
 * Pulls review frames out of the *encoded* video for every timeline event
 * (note frame, before/after action, end hold) and verifies the file decodes
 * completely. Run automatically after recording; rerun by hand with
 *   bun src/review.ts output/latest
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { decodeAll, extractFrame, hasFfmpeg, probeDuration } from './media.ts';
import type { RecordingManifest } from './types.ts';

export interface ReviewResult {
  frames: Array<{ id: string; label: string; seconds: number; file: string }>;
  decodedFrames: number | null;
  durationSeconds: number | null;
  warnings: string[];
}

export async function reviewRecording(dir: string): Promise<ReviewResult> {
  const manifestFile = path.join(dir, 'timeline.json');
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as RecordingManifest;
  const video = path.join(dir, manifest.video.webm);
  const result: ReviewResult = { frames: [], decodedFrames: null, durationSeconds: null, warnings: [] };
  if (!hasFfmpeg()) {
    result.warnings.push('ffmpeg/ffprobe not found: review frames and decode check skipped. Review the WebM in a browser instead.');
    return result;
  }
  result.durationSeconds = await probeDuration(video);
  result.decodedFrames = await decodeAll(video);
  if (result.decodedFrames === null) result.warnings.push('Full decode failed: the video may be truncated or corrupt.');

  const duration = result.durationSeconds ?? Infinity;
  for (const event of manifest.events) {
    const samples: Array<[string, number]> = [['start', Math.min(event.startSeconds + 0.6, event.endSeconds)]];
    if (event.actionSeconds !== null) {
      samples.push(
        ['before', Math.max(event.startSeconds, event.actionSeconds - 0.15)],
        ['during', Math.min(event.actionSeconds + 0.8, event.endSeconds)],
        ['after', Math.max(event.actionSeconds + 0.5, event.endSeconds - 1.2)],
      );
    }
    samples.push(['end', Math.max(event.startSeconds, event.endSeconds - 0.25)]);
    for (const [label, seconds] of samples) {
      if (seconds > duration) {
        result.warnings.push(`${event.id}/${label} at ${seconds}s is beyond the encoded duration ${duration}s`);
        continue;
      }
      const file = path.join('review', `${event.id}-${label}.png`);
      if (await extractFrame(video, seconds, path.join(dir, file))) result.frames.push({ id: event.id, label, seconds, file });
      else result.warnings.push(`could not extract ${event.id}/${label} at ${seconds}s`);
    }
  }
  writeFileSync(path.join(dir, 'review.json'), JSON.stringify(result, null, 2));
  return result;
}

if (import.meta.main) {
  const dir = process.argv[2] ?? path.join(path.dirname(new URL(import.meta.url).pathname), '../output/latest');
  if (!existsSync(path.join(dir, 'timeline.json'))) {
    console.error(`No timeline.json in ${dir}`);
    process.exit(2);
  }
  const result = await reviewRecording(dir);
  console.log(`decoded frames: ${result.decodedFrames ?? 'n/a'}, duration: ${result.durationSeconds ?? 'n/a'}s, review frames: ${result.frames.length}`);
  for (const w of result.warnings) console.warn(`warning: ${w}`);
}
