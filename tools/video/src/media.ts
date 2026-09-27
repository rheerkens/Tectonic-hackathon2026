import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

async function run(cmd: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(cmd, { stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { code, stdout, stderr };
}

export const hasFfmpeg = () => Bun.which('ffmpeg') !== null && Bun.which('ffprobe') !== null;

export async function probeDuration(file: string): Promise<number | null> {
  if (!hasFfmpeg()) return null;
  const { code, stdout } = await run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  if (code !== 0) return null;
  const value = Number(stdout.trim());
  return Number.isFinite(value) ? value : null;
}

export async function transcodeMp4(webm: string, mp4: string): Promise<boolean> {
  if (!hasFfmpeg()) return false;
  const { code } = await run(['ffmpeg', '-y', '-loglevel', 'error', '-i', webm, '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
  return code === 0 && existsSync(mp4);
}

/** Extracts one frame from the *encoded* video at `seconds` (this is what reviewers must look at). */
export async function extractFrame(video: string, seconds: number, out: string): Promise<boolean> {
  if (!hasFfmpeg()) return false;
  mkdirSync(path.dirname(out), { recursive: true });
  const { code } = await run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', seconds.toFixed(3), '-i', video, '-frames:v', '1', out]);
  return code === 0 && existsSync(out);
}

/** Decodes the whole file to verify it plays through; returns decoded frame count. */
export async function decodeAll(video: string): Promise<number | null> {
  if (!hasFfmpeg()) return null;
  const { code, stderr } = await run(['ffmpeg', '-v', 'info', '-i', video, '-f', 'null', '-']);
  if (code !== 0) return null;
  const match = /frame=\s*(\d+)/g;
  let frames: number | null = null;
  let m;
  while ((m = match.exec(stderr))) frames = Number(m[1]);
  return frames;
}
