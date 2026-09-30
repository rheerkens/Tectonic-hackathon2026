# Rebuild the SDtrust demo

`src/render-demo.py` rebuilds the approved 150 second main film and joins the existing 10 second Finn introduction with a 0.6 second transition. The final film is 159.4 seconds, 1920 × 1080, 60 fps. It reads the shared `style.json` beside this document. No application code or interface pixels are generated.

Use Python 3.10 or newer with Pillow and NumPy, and FFmpeg plus FFprobe on PATH. FFmpeg needs libx264 and the xfade/acrossfade filters. Install Python dependencies with `python -m pip install Pillow numpy`. The default fonts are Segoe UI from the Windows Fonts directory. On another system, provide a directory containing the licensed `segoeui.ttf` and `segoeuib.ttf` files with `--font-dir`.

From the repository root, this command rebuilds the current film using only the committed media. No running app, browser, Bun installation, ElevenLabs account or files from the original producer's machine are needed for this render:

```sh
python tools/video/src/render-demo.py --assets tools/video/inputs/assets --captures tools/video/inputs/captures --baseline tools/video/inputs/baseline.mp4 --intro tools/video/inputs/intro.mp4 --context-audio tools/video/inputs/context-mix.wav --output tools/video/output/rebuilt-demo --jobs 2
```

The fixed production inputs are committed under `inputs/`. Generated final films and temporary captures remain excluded from Git under `output/`. `--assets` contains `transcript_lang.json` with the original 40 speech alignment records and `merk_reverse.png`. `--baseline` is the approved 150 second film, including its final ElevenLabs voice and sound mix. It is retained as source media because the renderer reuses its unchanged scenes and soundtrack. `--intro` is the approved 10 second Finn film with audio. Both are 1920 × 1080. `--captures` contains:

| Relative file | Actual capture |
| :--- | :--- |
| `capture/context_clean.mp4` | 1440 × 900, 30 fps, 450 frames, 15 seconds |
| `capture/answer-focused.png` | Real answer view, 2880 × 1800 pixels |
| `capture/differences.png` | Real expanded differences view, 2880 × 1800 pixels |
| `details/atlas-owner-validity-2x.png` | Real source dialog, 2880 × 1800 pixels |
| `details/atlas-access-2x.png` | Same source dialog scrolled to access, 2880 × 1800 pixels |

To deliberately refresh these inputs, use `node tools/video/src/capture-demo.mjs --out tools/video/output/ui-published-captures` against the already running development stack. This optional capture step needs Node, Bun 1.4.2 or newer for `bun install --frozen-lockfile`, and the repository's installed Playwright and Chromium. It is not part of rebuilding the committed film. The capture command reads its URL from `.local/dev/runtime.json`, or accepts `--url`. It starts the screencast only after the empty composer and fonts have loaded, records frame and interaction timestamps, and exports exactly 450 frames. There is no guessed startup trim offset. The final frame is held if the source movie is shorter than 15 seconds.

Captures use a 1440 × 900 CSS viewport and scale factor 2 for still images. The real app is opened as demo user Wanne. Question: “Tot wanneer mag Atlas loonmutaties aanleveren in België in oktober?” The current interface recognises context from this question and displays labels instead of selectors. Visible answer: “22 oktober 2026”, supported by Klantafspraak Atlas, S4, version 2, confirmed by Roy Heerkens. `inputs/captures/capture/export.json` records the captured Git commit, application changes, dimensions and dialog bounds. `inputs/captures/capture/timings.json` records frame and interaction times. These original manifests also reference intermediate captures not consumed by the renderer and therefore not bundled. Their localhost URL and original paths are historical provenance, not runtime dependencies. Review refreshed screenshots before rendering, since layout changes can require new crop coordinates.

The current capture set records commit `1b25e358bd6eb143da42f3a5fd3565f86ca11430` with no application changes. Its source dialog bounds are `(410, 35.875, 620, 828.25)` in CSS pixels. Both owner and access scenes use extent `(400, 485, 1040, 885)`, preserving the complete responsible person, validity and access sections without cutting their headings. The compact dialog no longer includes the earlier time travel controls or action buttons.

The renderer replaces main film intervals 13–28, 84–99, 99–112, 120–124, 132–136 and 136–150 seconds. All other intervals come from the baseline. The focused answer and differences crops remove the sidebar while preserving the actual content. Source dialog crops are expressed in CSS coordinates and scaled to the image pixels. Purple reading outlines are separate overlays, never replacement text.

The narration text and original timing boundaries are included in the script. Captions use SDtrust. Without `--context-audio`, the main film copies the baseline audio stream without decoding or remixing it and retains the original captions.

For the current interface, the command above includes `--context-audio tools/video/inputs/context-mix.wav`. This input contains the complete 15 second stereo mix for main film seconds 13 through 28, including background sound. `inputs/context-audio.json` preserves the ElevenLabs voice, replacement timing and original speech filename as provenance; that original MP3 is not required because its processed speech is already in the WAV. The matching caption becomes “Finn herkent België, de klant Atlas en oktober.” at the original cue timing. The renderer joins baseline seconds 0 through 13, the replacement's 0 through 15, and baseline seconds 28 through 150, then encodes the main audio as stereo AAC at 256 kb/s and 48 kHz. The original audio outside that interval is retained as source material but is reencoded in this mode.

Joining the Finn intro then encodes one AAC track with a 0.6 second audio crossfade. This final join changes the transition audio in either mode. Only the standalone `SDtrust_main_150.mp4` without a context audio override retains the original main audio bitstream.

`--jobs` defaults to 2 independent rendering processes. Each encoder uses two threads. Output includes segment MP4s, midpoint JPEGs for refreshed scenes, `SDtrust_main_150.mp4`, `SDtrust_demo_159.4.mp4` and `render-report.json`. Segment frame counts, dimensions and durations are checked automatically. The output directory is overwritten on reruns, so choose a fresh directory to retain previous renders. Review the finished video visually before sharing it. Generated output belongs under the ignored `tools/video/output/` directory.
