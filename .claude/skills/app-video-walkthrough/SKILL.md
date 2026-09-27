---
name: app-video-walkthrough
description: Record, review and package an instructive silent video walkthrough of this repository's task board using the repo's Playwright recorder (tools/video). Use when asked for a demo video, app tutorial, walkthrough recording, or to update captions/steps of the existing one.
---

# App video walkthrough (repo-local)

This repository ships a scripted recorder in `tools/video`. Use it rather than ad-hoc screen capture. If the global `app-video-walkthrough` skill is installed, its method (scout → timed script → editable recording → review the encoded artifact → package) applies; this file maps it onto this repo.

## Where things are

- `tools/video/scenarios/board-tour.ts`: the editable script. Each step has a stable `id`, `chapter`, `kind` (`view` | `slide` | `note` | `action`), exact `caption`, exact `input`, live `target` locator, real `act`, bounded `expect`, and documentation fields (`actor`, `offscreen`, `expected`). Edit captions and inputs here; never in generated files.
- `tools/video/assets/overlay.css`: paper-note styling, dim mask, target outline, cursor. Shared by all scenarios.
- `tools/video/src/record.ts`: recording contract (measure target after layout settles → note → hold → remove note but keep outline → real interaction → assertion → hold), timeline, screenshots.
- `tools/video/src/review.ts`: extracts frames from the **encoded** video at each step's start/action/end and runs a full decode.
- `tools/video/src/package-player.ts`: single-file offline HTML player with chapter sidebar.
- Output: `tools/video/output/<runId>/` (git-ignored), `output/latest` symlink.

## Procedure

1. **Scout.** Start the app (`bun run dev`) and look at it; read the scenario file and `apps/web/src/components` for the real `data-testid` targets. Confirm facts you plan to state (roles, seed data in `packages/db/src/seed.ts`, auth behaviour in `docs/auth.md`).
2. **Edit the script.** Change or add steps with stable ids. Explain an action *before* it happens; announce each scenario with a `slide`; keep the closing slide distinct. Inputs are synthetic; the presenter is Ada, the unrecorded second session is Grace.
3. **Rehearse.** `bun run video -- --rehearsal` (short holds). Fix locator, layout or assertion failures until it completes with no notes about clipped text or page errors.
4. **Record.** `bun run video`. It launches an isolated `video` profile with a freshly seeded database (never the developer's `dev` data, never production), records 1920×1080, writes `timeline.json`, `chapters.json`, `script.md`, `frames/`, `review/`, `video.webm` (+ `video.mp4` with ffmpeg) and `player.html`.
5. **Review the artifact, not the plan.** Open `review/*.png` (frames decoded from the video) for every step: note readable and not covering the target, action visible (cursor, outline, typed text), expected state reached, chronology correct. Check `timeline.json` `video.driftSeconds` (capture clock vs encoded duration) and `notes`. Play `player.html` from `file://` with the network disabled: chapters seek, first/last frames, download works. Fix the smallest step and re-record; a source edit always means a full new capture.
6. **Deliver.** Report paths, duration, size, viewport, what was verified and any limitation (e.g. no ffmpeg → no MP4/review frames). Keep recordings out of git.

## Constraints

- Silent captions by default; no narration unless asked.
- Only demo identities and seeded data; do not point the recorder at a shared or production stack.
- Do not speed up transitions or splice frames to hide failures.
