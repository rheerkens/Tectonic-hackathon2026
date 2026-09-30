# Agent handoff: Microsoft activity clips

Read the repository-root `AGENTS.md`, this file, and `README.md` in this directory before changing the clips. The README explains provenance, the actual T3/FFmpeg generation process, React and MP4 consumption, source-pixel coordinates, timing, export commands and verification.

## Required fidelity

- Preserve authentic Microsoft interface pixels. The user explicitly rejected invented Teams, Outlook and SharePoint layouts. Do not replace these with generated screenshots, CSS approximations, skeleton text or letter logos.
- Use a real replacement screenshot when different app content or a different product version is needed. Keep the source page and original asset URL in `apps/web/src/agent-activity/scenes.ts`.
- Animate the separate SVG overlay. The screenshot is a static source image; the cursor does not actually click, scroll or navigate within Microsoft applications. Do not claim live account access or real agent search results.
- Captions describe visible content. Do not change names, messages or UI text inside the bitmap to match the payroll story.

## Editing workflow

1. Start with the README file map and identify the smallest relevant change. Source images and the live component live under `apps/web`, not in this tool package.
2. Keep `size`, `crop` and `targets[].rect` in original-image pixels. The current player needs four targets; changing that requires changing its timeline and index logic too.
3. Preview the changed scene through `/agent-activity?scene=<id>`, preserving pause and reduced-motion behaviour.
4. Regenerate the affected MP4s and JPEG posters, then rebuild the offline HTML gallery. A clean checkout needs all six scenes exported before bundling.
5. Follow the root verification rules. No new or extended tests. Run existing checks and inspect the actual browser/video output. Report absent scripts or checks that were not run.
6. Commit source code, original screenshot assets, provenance and documentation. Never force-add `tools/video/output/`, `.local/`, secrets or recordings.

## Capture constraints

- Prefer T3's collaborative preview tools when available for browser inspection and recording. The README documents both that process and the CLI exporter for other environments.
- Wait for the screenshot to load before recording. Do not edit files during capture: HMR resets the scene.
- Preserve a full loop duration, 1440×900 dimensions, 30 fps, square pixels and silent H.264 output unless explicitly asked to change the format.
- Do not introduce a guessed timing offset. Both capture paths take one complete period from a stable, loaded animation.
- Keep the public assets, `data-ready`, `data-loop-ms` and scene-ID discovery contract consistent with the exporter.

## Sharing and integration

The branch carries source screenshots and reproducible tooling. Rendered videos and the self-contained HTML are intentionally ignored, so a colleague must regenerate them or receive the generated HTML separately. A local/Tailscale URL is only a convenience preview, not a public deployment. Embed the React component for editable runtime animation, or consume the MP4/JPEG pair for fixed media; see the README examples.
