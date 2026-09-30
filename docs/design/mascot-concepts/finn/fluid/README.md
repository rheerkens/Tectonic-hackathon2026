# Finn fluid animation study

Four new gestures: welcome, listening, thinking and presenting an answer. Open `/finn-motion.html` on the running web server for an old/new comparison. The character is approximately 275 CSS pixels tall at rest, matching the supplied screenshot. Both versions are shown at the same character height.

## Artwork and playback

The four `*-sheet.png` files are original transparent artwork generated with the built-in `image_gen` tool, using `finn-idle-v2.png` as the character reference. Each sheet contains sixteen poses. The full prompts are preserved in `prompts.json`.

`build.py` isolates each character using connected alpha components and registers the foot baseline. A constant scale across each gesture preserves the intentional head dips and leaning motion. Listening and thinking use curated entry/return sequences to avoid abrupt changes into a different gesture.

In-between frames use [RIFE ncnn Vulkan](https://github.com/nihui/rife-ncnn-vulkan), model v4.6, from release 20221029. Black and white background passes are recombined into transparent frames. Playback is 30 fps, with a short rest before each review loop. Some small generated drawing variation remains; this is interpolated sprite animation, not a 3D character rig.

The outputs in `apps/web/public/mascots/finn-fluid/` include GIF, animated WebP and static PNG for each state, plus timing metadata and a ZIP. WebP is used in the preview for smoother alpha edges; GIF has binary transparency and a 255-colour palette. The four approved GIFs and posters replace the matching production assets in `mascots/finn/`; their previous versions are archived under `finn-fluid/previous/` for comparison.

The comparison page supports selection, pause, replay, sequential playback, downloads and reduced motion. Review loops are intentional; a product integration should play greeting/result gestures only when relevant. The answer gesture does not imply verification.

## Rebuild

Use Python with `numpy==2.2.3`, `opencv-python-headless==4.11.0.86` and `Pillow==11.1.0`. Set `RIFE_BIN` to the RIFE executable (its sibling `rife-v4.6` model folder is required). The default executable location is `.local/rife/rife-ncnn-vulkan-20221029-ubuntu/rife-ncnn-vulkan`. The script uses Vulkan GPU 0. Run:

```sh
python docs/design/mascot-concepts/finn/fluid/build.py
python docs/design/mascot-concepts/finn/export_gifs.py
```

Interpolation scratch files and binaries stay under the ignored `.local/` directory. The source sheets, prompts and resulting assets are kept in the repository.
