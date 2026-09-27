/**
 * Embeds a video and its chapter list into one offline HTML file (port of the
 * skill's package_player.py). Usage:
 *   bun src/package-player.ts --video out/video.webm --chapters out/chapters.json --title "Board tour" --output out/player.html
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Chapter {
  seconds: number;
  title: string;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function buildPlayer(opts: { video: string; chapters: Chapter[]; title: string; language?: string; poster?: string; template?: string }): string {
  const ext = path.extname(opts.video).toLowerCase();
  if (ext !== '.webm' && ext !== '.mp4') throw new Error('Use a WebM or MP4 video.');
  if (!Array.isArray(opts.chapters) || opts.chapters.length === 0) throw new Error('Chapters must be a nonempty array.');
  if (opts.chapters[0]!.seconds !== 0) throw new Error('The first chapter must start at zero.');
  let previous = -1;
  const buttons = opts.chapters.map((chapter) => {
    if (!Number.isFinite(chapter.seconds) || chapter.seconds < 0 || chapter.seconds <= previous) {
      throw new Error('Chapter seconds must be finite, nonnegative and strictly increasing.');
    }
    if (!chapter.title.trim()) throw new Error('Every chapter needs a title.');
    previous = chapter.seconds;
    const label = `${Math.floor(chapter.seconds / 60)}:${String(Math.floor(chapter.seconds % 60)).padStart(2, '0')}`;
    return `<button type="button" data-time="${chapter.seconds}"><span>${label}</span>${escapeHtml(chapter.title)}</button>`;
  });
  const mime = ext === '.webm' ? 'video/webm' : 'video/mp4';
  const videoUri = `data:${mime};base64,${readFileSync(opts.video).toString('base64')}`;
  let poster = '';
  if (opts.poster) {
    const pmime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[path.extname(opts.poster).toLowerCase()];
    if (!pmime) throw new Error('Poster must be PNG, JPEG or WebP.');
    poster = ` poster="data:${pmime};base64,${readFileSync(opts.poster).toString('base64')}"`;
  }
  const template = readFileSync(opts.template ?? fileURLToPath(new URL('../assets/player.html', import.meta.url)), 'utf8');
  for (const token of ['@@VIDEO@@', '@@CHAPTERS@@']) if (!template.includes(token)) throw new Error(`Template is missing ${token}`);
  const values: Record<string, string> = {
    TITLE: escapeHtml(opts.title),
    LANGUAGE: escapeHtml(opts.language ?? 'en'),
    CHAPTERS: buttons.join('\n'),
    VIDEO: videoUri,
    POSTER: poster,
    FILENAME: escapeHtml(path.basename(opts.video)),
  };
  return template.replace(/@@(TITLE|LANGUAGE|CHAPTERS|VIDEO|POSTER|FILENAME)@@/g, (_, key: string) => values[key]!);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const opt = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const video = opt('--video');
  const chapters = opt('--chapters');
  const output = opt('--output');
  const title = opt('--title') ?? 'App walkthrough';
  if (!video || !chapters || !output) {
    console.error('Usage: bun src/package-player.ts --video <file.webm|mp4> --chapters <chapters.json> --output <player.html> [--title T] [--language en] [--poster img] [--template html]');
    process.exit(2);
  }
  if (!existsSync(video)) throw new Error(`Video not found: ${video}`);
  const html = buildPlayer({ video, chapters: JSON.parse(readFileSync(chapters, 'utf8')), title, language: opt('--language'), poster: opt('--poster'), template: opt('--template') });
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, html);
  console.log(JSON.stringify({ output: path.resolve(output), bytes: html.length, videoBytes: readFileSync(video).length }));
}
