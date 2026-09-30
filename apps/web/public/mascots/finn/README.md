# Finn GIF assets

Eight transparent GIFs. Welcome, listening, thinking and answer use the approved
384×384 fluid animations; idle, verified, uncertain and retry remain 256×256.
Read each animation’s width and height from `animations.json`.
For efficient browser playback, prefer `web-animations.json`: transparent video,
WebP fallback and small posters at content-hashed URLs. Regenerate it with
`python3 docs/design/mascot-concepts/finn/fluid/build_web.py` after this exporter.
Use `/mascots/finn/finn-idle.gif` in the web app (Vite serves this folder).

```html
<picture>
  <source media="(prefers-reduced-motion: reduce)" srcset="/mascots/finn/finn-idle.png">
  <img src="/mascots/finn/finn-idle.gif" width="64" height="64" alt="">
</picture>
```

Idle blinks immediately, then rests for six seconds; thinking loops its fluid gesture.
The other six GIFs play once and hold their final frame. `animations.json` lists
filenames, duration, loop behavior, posters, and suggested next state. Use the duration
to change back to idle for welcome, answer, or verified; GIF has no completion event.
Use a new image URL (e.g. a replay query parameter) to restart a completed one-shot.
Use the matching PNG for reduced motion or a paused state. Do not infer verification
from Finn's decorative folder checkmark. A verified gesture requires explicit app status.

GIF has 256 colours and binary transparency, so edges are harder than the source PNGs.
The original PNG sheets and fluid generation prompts are preserved in the design directory.
The fluid review encodings are in the sibling `finn-fluid` folder. The exporter promotes
those four GIFs and posters while preserving production loop/one-shot behavior.
Rebuild from repo root with `python3 docs/design/mascot-concepts/finn/build_preview.py`
(Pillow required). Prompts and source art live in that same design directory.
