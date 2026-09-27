# Video walkthroughs

Repeatable, editable recordings of the real running app, produced with Playwright's video capture.

```sh
bun run video                      # full recording at viewer pace (launches an isolated `video` stack)
bun run video -- --rehearsal       # fast pass with short holds: catches locator/layout failures
bun run video -- --base-url http://localhost:49000   # reuse a running stack instead of launching one
bun run --cwd tools/video review output/latest       # re-extract review frames from the encoded video
bun run --cwd tools/video package -- --video output/latest/video.webm --chapters output/latest/chapters.json --title "Board tour" --output output/latest/player.html
```

Output goes to `tools/video/output/<runId>/` (git-ignored, `output/latest` points at the newest run):

| File | What it is |
|---|---|
| `video.webm` | Playwright capture (1920×1080). `video.mp4` is added when ffmpeg is installed. |
| `timeline.json` | Actual timestamps per step id (start, action, end), target bounds, captions, drift between capture clock and encoded duration, notes. |
| `chapters.json` | Chapter start times for the player. |
| `script.md` | Generated review table in the skill's script format, ready for feedback by step id. |
| `frames/` | Capture-time screenshots per step (note visible, before/after each action). |
| `review/` | Frames extracted from the **encoded** video at each step's start/action/end, plus a full decode check (`review.json`). |
| `player.html` | Single-file offline player with a chapter sidebar (video embedded as base64). |

## Editing the walkthrough

- Steps live in `scenarios/board-tour.ts`: id, chapter, kind (`view`, `slide`, `note`, `action`), exact caption, exact `input`, `target` locator, `act`, `expect`, and documentation fields (actor, off-screen action, expected result).
- Overlay styling is separate in `assets/overlay.css` (paper-note look, dim mask, target outline, cursor).
- Recording mechanics (measuring targets, timeline, holds) are in `src/record.ts` and `src/overlay.ts`; packaging in `src/package-player.ts`; encoded-video review in `src/review.ts`.
- The recorded session is Ada; a second unrecorded browser session (Grace) performs the "other person" actions for real.

Prerequisites: Bun, Chromium for Playwright (`bun run --cwd tools/video install-browsers`), and optionally ffmpeg/ffprobe for MP4 output, review frames and the decode check.
