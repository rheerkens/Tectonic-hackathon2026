# Agent activity clips

Six silent loops illustrate an agent reading Teams, Outlook, SharePoint, a PDF, an organisation profile and file permissions. The app interfaces are **original Microsoft screenshots**. A separate SVG layer supplies the agent cursor, reading rectangle and scan line. These are illustrative animations, not recordings of a live Microsoft integration.

**Agent handoff:** read [AGENTS.md](./AGENTS.md), then use the workflow below. [PRODUCT.md](./PRODUCT.md) records the visual requirements.

## How this version was generated

1. Located the existing six-scene work in T3 thread `05883ed7-940e-4c13-8e0a-c470dd021b3e` and replaced its invented app layouts with public Microsoft product images.
2. Downloaded the original-resolution images from Microsoft Support, Tech Community, Learn and the Microsoft Message Center CDN. The organisation image is linked from the MC1151242 archive. Each exact source page and asset URL is retained in `scenes.ts`.
3. Kept the screenshot content intact. The SVG viewport crops Outlook's outer shadow and the bottom of the tall organisation chart. No image generation was used; the request required authentic interface text, icons and spacing.
4. Positioned four reading rectangles over visible content in each image. React advances them with `requestAnimationFrame`; the original screenshot remains a static background. The captions are Dutch, while the English screenshot text remains as published by Microsoft.
5. Recorded each loaded scene with the T3 collaborative browser recorder. FFmpeg produced 1440×900, 30 fps, 12-second H.264 MP4 files with no audio. JPEG posters were extracted from the video, then `video:gallery` embedded the videos and posters as data URLs in one offline HTML file.
6. Inspected all scenes in the browser, checked all six videos decode and play, verified pause, mobile layout and loop boundaries, and ran the repository checks. The CLI exporter is an alternative generation path; this set of delivered MP4s was captured with T3, not that CLI.

Original screenshots are in `apps/web/public/agent-sources/`. Microsoft owns the product images and trademarks; retain their source links. The public sample content is not the app's Atlas/payroll dataset.

## Run and review

From the repository root, on Bun 1.4.2 or newer:

```sh
bun install --frozen-lockfile
bun run dev
```

Read the web URL printed by the launcher or `.local/dev/runtime.json`. Do not assume a port, and do not start a duplicate stack in the same worktree.

- Open `/agent-activity` for the live six-scene gallery and its pause button.
- Open `/agent-activity?scene=outlook` for one recording scene. Other IDs: `teams`, `sharepoint`, `handbook`, `experts`, `access`.
- The gallery requires no login and uses only static public sample images.
- Use `bun run dev:stop` to stop this worktree's stack.

## Consume the content

### Embed the live animation in React

For example, from a component inside `apps/web/src/components/`:

```tsx
import { AgentActivity } from '../agent-activity/AgentActivity.tsx';

<div style={{ width: '100%', maxWidth: 640 }}>
  <AgentActivity source="outlook" paused={!isWorking} />
</div>
```

The component fills its container at an 8:5 aspect ratio. Changing `source` selects a different scene. `paused` freezes its clock; `prefers-reduced-motion` shows a static state. The component imports its own CSS, and the screenshot URLs are served from the web app's `public` folder. If embedding elsewhere, copy the source images too and update the `image` URLs. Unknown IDs render nothing. Provide real progress separately: this animation does not query accounts or report actual search results.

### Use the MP4 or offline gallery

After exporting, use `tools/video/output/snippets/<scene>.mp4` in a video player, with `loop`, `muted`, `playsInline` and an accessible pause control. Respect reduced-motion preferences before autoplaying. The `<scene>.jpg` is a static poster.

`tools/video/output/snippets/index.html` contains all six clips, posters, download links and source citations in a single file. Open it directly or send that HTML file on its own. No server or network is needed for playback; source links need internet access.

**Generated MP4s, posters and HTML are git-ignored.** A fresh checkout contains the source screenshots, components and generation tools, so regenerate the output locally. Do not force-add recordings to Git.

## Where to make changes

| Change | File (relative to repository root) |
| --- | --- |
| Screenshot, source URL, crop, target rectangles, captions, scene ID | `apps/web/src/agent-activity/scenes.ts` |
| Original source images | `apps/web/public/agent-sources/` |
| Cursor, scan line, interpolation and timeline | `apps/web/src/agent-activity/AgentActivity.tsx` |
| Preview layout, colours, spacing and sizing | `apps/web/src/agent-activity/agent-activity.css` |
| Live gallery and scene selection | `apps/web/src/agent-activity/Gallery.tsx` |
| Browser capture and FFmpeg export | `tools/video/src/snippets.ts` |
| Offline HTML layout, controls and embedded assets | `tools/video/src/gallery.ts` |

### Change a screenshot or reading target

1. Obtain an authentic replacement screenshot and save it in `apps/web/public/agent-sources/`. Keep the source page and original image URL.
2. Set `size: [width, height]` to the image's **actual pixel dimensions**. Set `image`, `source` and `asset` accordingly.
3. `crop`, when present, is `[x, y, width, height]` in original-image pixels. It changes the SVG viewport; it does not rewrite the file.
4. Each target's `rect` is also `[x, y, width, height]` in **original-image pixels**, even when a crop is applied. Do not use CSS pixels measured from the scaled preview. For example, Outlook's `[328, 278, 320, 70]` identifies the Lydia Bauer row in the 1431×856 source image.
5. Update `label` to describe the visible content, and check the corresponding `?scene=` preview at recording size.

The current player expects **exactly four targets per scene**. To change the count, update its clamped index and timeline as well. To add a source, add an image and a `SCENES` entry with a unique ID and four targets; both galleries discover it. Update the fixed scene-count text in `Gallery.tsx` and `gallery.ts` too.

### Change timing or motion

`LOOP_MS` in `scenes.ts` is 12,000 ms. In `AgentActivity.tsx`, the first second is clean, four reading steps take two seconds each, the final target is held, the overlay fades between 10.4 and 10.8 seconds, and the remaining interval is clean before restart. Interpolation uses an ease-out curve. The screenshot itself does not move or change state.

If changing duration, update all related timeline constants, the reduced-motion static timestamp, and the gallery's displayed duration. The exporter reads `data-loop-ms`; `data-ready="true"` means the screenshot has loaded. Preserve these attributes and the `.aa-gallery-grid code` scene-ID entries, which the exporter reads.

## Export updated content

Keep `bun run dev` running in another terminal. FFmpeg must be on `PATH`, and Playwright must have a matching Chromium install:

```sh
bunx --bun playwright-core@1.63.0 install chromium
bun run video:snippets
bun run video:gallery
```

For an installed compatible Chromium, set `CHROMIUM_PATH` instead. Browser setup can require OS libraries on a fresh Linux machine.

Render only modified scenes after the first complete export:

```sh
bun run video:snippets teams outlook
bun run video:gallery
```

For a different running stack, supply its actual web URL:

```sh
bun run video:snippets --url "$VIDEO_WEB_URL" teams
```

The CLI records a loaded continuous loop plus padding, then trims one complete period from the tail. It explicitly sets 30 fps and the frame count, with no machine-specific video-start offset. It also writes JPEG posters. The gallery command requires an MP4 **and** JPEG for every registered scene; on a clean checkout, export all scenes first. It writes `index.html` and `sources.json` into the ignored output directory.

### T3 collaborative browser capture

When working in T3 with its preview tools, prefer those tools for browser inspection and recording. Navigate to the single-scene URL, resize to 1440×900 and wait for `.aa[data-ready="true"]`. Record at least 14 seconds without editing source files, switching tabs or resizing; Vite HMR interrupts a capture. Stop recording and use the returned local MP4 path.

This is the FFmpeg transformation used for the delivered clips (set `RAW_CLIP` and `SCENE` first):

```sh
ffmpeg -y -ss 1 -i "$RAW_CLIP" \
  -vf 'scale=1440:900:flags=lanczos,setsar=1,fps=30,setpts=PTS-STARTPTS' \
  -r 30 -frames:v 360 -an -c:v libx264 -crf 16 -pix_fmt yuv420p \
  -movflags +faststart "tools/video/output/snippets/$SCENE.mp4"
ffmpeg -y -ss 4 -i "tools/video/output/snippets/$SCENE.mp4" \
  -frames:v 1 -q:v 2 "tools/video/output/snippets/$SCENE.jpg"
bun run video:gallery
```

The 1-second trim skips recording startup; it is not a scene-start calibration. A fully loaded continuous loop can be cut at any phase when its complete 12-second period is preserved. T3 may record at device pixel resolution, so scaling and square-pixel normalization are explicit. Keep output frame rate explicit too; 360 frames at 25 fps would incorrectly produce 14.4 seconds.

## Validation before handing off

Run `bun run check` and `bun test tools/dev`. Root `AGENTS.md` also requests `bun run test:e2e` for UI changes, but this branch currently has no such script; report that limitation rather than claiming it ran. Do not add tests under the hackathon rules.

Inspect changed scenes in the real browser, then verify all exported videos play without errors, retain their intended aspect ratio and duration, and wrap without a visible jump. Verify the gallery pause control, reduced-motion handling, mobile overflow and readable text under dark system appearance. Keep recordings and `.local/` out of commits.
