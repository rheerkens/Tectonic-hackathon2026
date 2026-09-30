# Finn GIF assets

Eight transparent 256×256 GIFs, assembled from the approved Finn sprite sheets.
Use `/mascots/finn/finn-idle.gif` in the web app (Vite serves this folder).

```html
<picture>
  <source media="(prefers-reduced-motion: reduce)" srcset="/mascots/finn/finn-idle.png">
  <img src="/mascots/finn/finn-idle.gif" width="64" height="64" alt="">
</picture>
```

Idle blinks immediately, then rests for six seconds; thinking loops only its core gesture.
The other six GIFs play once and hold their final frame. `animations.json` lists
filenames, duration, loop behavior, posters, and suggested next state. Use the duration
to change back to idle for welcome, answer, or verified; GIF has no completion event.
Use a new image URL (e.g. a replay query parameter) to restart a completed one-shot.
Use the matching PNG for reduced motion or a paused state. Do not infer verification
from Finn's decorative folder checkmark. A verified gesture requires explicit app status.

GIF has 256 colours and binary transparency, so edges are harder than the source PNGs.
The original PNG sheets remain the best source for a canvas sprite player.
Rebuild from repo root with `python3 docs/design/mascot-concepts/finn/build_preview.py`
(Pillow required). Prompts and source art live in that same design directory.
