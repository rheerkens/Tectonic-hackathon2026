# Finn animation sprites, expanded edition

Open [preview.html](preview.html) for the self-contained animation review. Download [finn-sprites.zip](finn-sprites.zip) for all eight transparent source sheets, frame metadata, prompts, and the offline preview.

The current edition contains **96 newly generated source frames: twelve per state**, up from four. Each PNG uses four columns and three rows in reading order. Gestures now include gradual entry and return-to-rest poses, with action frames generally lasting 83–120 ms. Thinking has a separate core loop, so Finn keeps his hand at his chin while waiting. The idle blink holds still between blinks and uses a curated frame order to avoid an unintended wink.

The source art is preserved unchanged. The manifest detects actual transparent gutters instead of assuming exact grid divisions. The preview registers frames by the feet and scales their height to reduce generated position and scale differences. Some drawing variation remains between frames; this is still generated animation art, not a continuous skeletal rig. The [previous four-frame preview](preview-v1.html), original PNGs, and `animation-spec.json` remain available for comparison.

| State | When | Playback |
| --- | --- | --- |
| Welcome | First visit in a session | A short wave, then idle. Do not repeat on every page navigation. |
| Idle | Chat available | Blink on activation, then six seconds of rest between blinks. |
| Listening | Chat opened or user composing | Small nod, then hold. No animation on each keystroke. |
| Thinking | Request pending | Slow source-checking loop; end as soon as the request resolves. |
| Answer | Answer ready | Open-palm presentation, then idle. This does not imply verification. |
| Verified | Explicitly verified result | One small thumbs-up and nod, then idle. |
| Uncertain | Conflicting sources or clarification needed | Thoughtful gesture, then hold with explanatory text. |
| Retry | Request or connection failure | Gentle apology, then hold with a visible retry action. |

Respect `prefers-reduced-motion` by displaying the state's representative static frame. Do not play sounds, open chat automatically, repeatedly wave for attention, or convey important status through the mascot alone. A decorative checkmark on Finn's folder is part of his character, not a result verification indicator.

## Files and integration

- `manifest.json`: source cell rectangles, local alpha bounds, foot pivots, frame timing, entry/loop/exit sequences, static frames, and atlas export coordinates.
- `animation-spec-v2.json`: current full prompts and intended triggers; generated with the built-in image_gen tool using the original Finn idle sheet as the identity reference.
- `finn-*-v2.png`: the eight current transparent sheets, twelve drawings each.
- `preview.html`: offline preview with all images embedded, state selection, pause/replay, frame inspection, and reduced motion.
- `preview-template.html`, `preview-player.js`, and `build_preview.py`: reproducible packaging. The script analyzes alpha bounds and packages original pixels; it does not redraw the mascot.

Coordinates in `frames[].cell` are absolute `[x, y, width, height]`. `bounds` is `[left, top, right, bottom]` relative to that cell; `pivot` is the local foot center and baseline. `sequence` indexes the twelve frames; `frameDurations` gives milliseconds per source frame. `loopSequence` follows the initial sequence while a looping state is active. `exitSequence` returns to rest before changing states. `reviewSequence` lets the preview replay the whole gesture. `nextState: null` means hold when a non-looping state ends. The preview implements the mapping.

The preview exports one aligned **1024 by 6144 atlas**, with four columns of 256-pixel frames, three rows per animation, in manifest state order. Use each frame's `atlasCell` for this exported atlas; source-sheet `cell` coordinates apply only to the original PNGs. `exportAtlas` records the complete export layout. This is a preview/export package, not an integration into the running application.

To rebuild: `python3 docs/design/mascot-concepts/finn/build_preview.py` (requires Pillow).

## Ready-to-use GIFs

Open [gifs.html](gifs.html) for the standalone GIF gallery or download [finn-gifs.zip](finn-gifs.zip). Production assets are in [`apps/web/public/mascots/finn`](../../../../apps/web/public/mascots/finn/README.md): eight transparent GIFs (384×384 for the four new fluid gestures, 256×256 for the other four), matching static PNGs for reduced motion, and `animations.json` with timings. Use `/mascots/finn/finn-idle.gif` in the app.

Idle previously held its first pose for six seconds, which looked paused. Its first blink now starts immediately; later cycles retain the quiet rest. The player labels that rest explicitly. Thinking exports its repeating core frames only. The other six GIFs play once; the app can switch to idle using the durations in `animations.json`. The GIF gallery has replay and pause controls.

`export_gifs.py` deterministically encodes the existing sprite drawings with a shared palette per animation, binary transparency, and full-frame disposal to prevent trails. GIF colour and alpha limits make edges harder than the source PNGs. Run `build_preview.py` to rebuild the preview, GIFs, gallery, and ZIPs together. No new image generation is used for these exports.

## Approved fluid animations

Welcome, listening, thinking and answer now use the [fluid animation artwork and interpolation pipeline](fluid/README.md). The canonical GIF URLs remain unchanged, with updated posters, dimensions and playback durations. The other four gestures are preserved. Open `/finn-motion.html` on the web server to compare the previous and approved animations at the screenshot’s character height.
