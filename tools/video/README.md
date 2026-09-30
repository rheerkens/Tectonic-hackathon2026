# Agent activity clips

Six 12-second silent loops using **original Microsoft product screenshots**, with a separate animated agent cursor and reading highlight. No generated interface text, redrawn application chrome, or fictional messages. These illustrate agent activity; they are not recordings of a live Microsoft integration.

The `/agent-activity` route shows all scenes, with a pause control and reduced-motion support. `?scene=teams` (or `outlook`, `sharepoint`, `handbook`, `experts`, `access`) fills a 1440×900 recording viewport. `<AgentActivity source="outlook" paused={false} />` is still reusable.

## Sources

Original image files are in `apps/web/public/agent-sources/`. `apps/web/src/agent-activity/scenes.ts` records the exact source page, original asset URL, source dimensions, optional viewport crop and reading rectangles for each clip. The Teams organisation screenshot comes from Microsoft's Message Center CDN, linked by the MC1151242 archive. Microsoft owns the product screenshots and trademarks. Source content remains unchanged; Outlook's outer shadow and the bottom of the tall organisation chart are cropped in the preview.

## Export

Start this worktree with `bun run dev`, then:

```sh
bun run video:snippets
bun run video:gallery
```

The exporter needs the pinned Playwright Chromium and FFmpeg. It captures a fully loaded continuous animation, cuts exactly one period from its tail, and writes MP4 and JPEG posters to `tools/video/output/snippets/`. There is no machine-specific video-start timing offset. Use `--url URL` to override the runtime URL; pass scene IDs to render a subset. The gallery command bundles all six videos and posters into one offline `index.html`, with downloads, native fullscreen controls, a global pause button and source citations. `sources.json` is exported alongside it.

In T3 Code, prefer the collaborative preview recorder. Record at least 14 seconds of a fully loaded scene, then trim any stable 12-second interval using FFmpeg. Do not change source files during recording because Vite HMR interrupts the loop. Generate a poster from the exported clip before bundling the gallery. Recordings remain git-ignored.
