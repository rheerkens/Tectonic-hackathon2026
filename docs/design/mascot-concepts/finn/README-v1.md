# Finn animation sprites

Open [preview.html](preview.html) for the self-contained animation review. Download [finn-sprites.zip](finn-sprites.zip) for all eight transparent source sheets, frame metadata, prompts, and the offline preview.

These are generated animation drafts: four illustrated frames per state, 32 source frames total. Each PNG uses a 2 by 2 layout in reading order. The source art is preserved unchanged. The manifest detects actual transparent gutters instead of assuming the generated cells divide exactly at the midpoint. The preview registers frames by the feet and scales their height to reduce generated position and scale differences. Some drawing variation remains between frames; review before integrating into the app.

| State | When | Playback |
| --- | --- | --- |
| Welcome | First visit in a session | A short wave, then idle. Do not repeat on every page navigation. |
| Idle | Chat available | Quiet blink, about every six seconds. |
| Listening | Chat opened or user composing | Small nod, then hold. No animation on each keystroke. |
| Thinking | Request pending | Slow source-checking loop; end as soon as the request resolves. |
| Answer | Answer ready | Open-palm presentation, then idle. This does not imply verification. |
| Verified | Explicitly verified result | One small thumbs-up and nod, then idle. |
| Uncertain | Conflicting sources or clarification needed | Thoughtful gesture, then hold with explanatory text. |
| Retry | Request or connection failure | Gentle apology, then hold with a visible retry action. |

Respect `prefers-reduced-motion` by displaying the state's representative static frame. Do not play sounds, open chat automatically, repeatedly wave for attention, or convey important status through the mascot alone. A decorative checkmark on Finn's folder is part of his character, not a result verification indicator.

## Files and integration

- `manifest.json`: source cell rectangles, local alpha bounds, foot pivots, frame timing, playback order, static frames, and next-state rules.
- `animation-spec.json`: full prompts and intended triggers; generated with the built-in image_gen tool using the selected Finn image as the identity reference.
- `finn-*.png`: the eight original transparent 2 by 2 sheets.
- `preview.html`: offline preview with all images embedded, state selection, pause/replay, frame inspection, and reduced motion.
- `preview-template.html` and `build_preview.py`: reproducible packaging. The script analyzes alpha bounds and packages original pixels; it does not redraw the mascot.

Coordinates in `frames[].cell` are absolute `[x, y, width, height]`. `bounds` is `[left, top, right, bottom]` relative to that cell; `pivot` is the local foot center and baseline. `sequence` indexes the four frames; `frameDurations` gives milliseconds for each source frame. `nextState: null` means hold when a non-looping state ends. The preview implements the mapping.

The preview can export one aligned 2048 by 4096 atlas: four 512-pixel columns, eight rows in manifest state order. Source-sheet coordinates do not apply to that exported atlas; use column times 512 and row times 512. This is a preview/export package, not an integration into the running application.

To rebuild: `python3 docs/design/mascot-concepts/finn/build_preview.py` (requires Pillow).
