# Rebuild the SDtrust demo

`src/render-demo.py` rebuilds the approved 150 second main film and joins the existing 10 second Finn introduction with a 0.6 second transition. The final film is 159.4 seconds, 1920 × 1080, 60 fps. It reads the shared `style.json` beside this document. No application code or interface pixels are generated.

Use Python 3.10 or newer with Pillow and NumPy, and FFmpeg plus FFprobe on PATH. FFmpeg needs libx264 and the xfade/acrossfade filters. Install Python dependencies with `python -m pip install Pillow numpy`. The default fonts are Segoe UI from the Windows Fonts directory. On another system, provide a directory containing the licensed `segoeui.ttf` and `segoeuib.ttf` files with `--font-dir`.

```powershell
python tools/video/src/render-demo.py `
  --assets C:/media/TrustLens_video_NL `
  --captures tools/video/output/ui-final-captures `
  --baseline C:/media/SDtrust_demo_logo_uitgelijnd.mp4 `
  --intro C:/media/Finn_intro_10sec.mp4 `
  --output tools/video/output/rebuilt-demo `
  --jobs 2
```

The media is external and intentionally excluded from Git. `--assets` must contain `transcript_lang.json` with the original 40 speech alignment records and `merk_reverse.png`. `--baseline` is the approved 150 second film, including its final ElevenLabs voice and sound mix. `--intro` is the approved 10 second Finn film with audio. Both must be 1920 × 1080. `--captures` must contain:

| Relative file | Actual capture |
| :--- | :--- |
| `capture/context_clean.mp4` | 1440 × 900, 30 fps, 450 frames, 15 seconds |
| `capture/answer-focused.png` | Real answer view, 2880 × 1800 pixels |
| `capture/differences.png` | Real expanded differences view, 2880 × 1800 pixels |
| `details/atlas-owner-validity-2x.png` | Real source dialog, 2880 × 1800 pixels |
| `details/atlas-access-2x.png` | Same source dialog scrolled to access, 2880 × 1800 pixels |

Create these inputs with `node tools/video/src/capture-demo.mjs --out tools/video/output/ui-final-captures` against the already running development stack. The capture command reads its URL from `.local/dev/runtime.json`, or accepts `--url`. It uses the repository's installed Playwright and Chromium. It starts the screencast only after the empty composer and fonts have loaded, records frame and interaction timestamps, and exports exactly 450 frames. There is no guessed startup trim offset. The final frame is held if the source movie is shorter than 15 seconds.

Captures use a 1440 × 900 CSS viewport and scale factor 2 for still images. The real app is opened as demo user Wanne. Context: België, Atlas, Oktober 2026. Question: “Tot wanneer mag Atlas loonmutaties aanleveren?” Visible answer: “22 oktober 2026”, supported by Klantafspraak Atlas, S4, version 2, confirmed by Roy Heerkens. `capture/export.json` records the captured Git commit, application changes, dimensions and dialog bounds. `capture/timings.json` records frame and interaction times. Keep these manifests with the external media package and review refreshed screenshots before rendering, since layout changes can require new crop coordinates.

The reviewed capture set uses commit `37e32e17786d482a324a676d15756a0c0c594ae8` with no application changes. Its source dialog bounds are `(410, 35.875, 620, 828.25)` in CSS pixels. Both owner and access scenes use extent `(400, 485, 1040, 885)`, preserving the complete responsible person, validity and access sections without cutting their headings. The compact dialog no longer includes the earlier time travel controls or action buttons.

The renderer replaces main film intervals 13–28, 84–99, 99–112, 120–124, 132–136 and 136–150 seconds. All other intervals come from the baseline. The focused answer and differences crops remove the sidebar while preserving the actual content. Source dialog crops are expressed in CSS coordinates and scaled to the image pixels. Purple reading outlines are separate overlays, never replacement text.

The narration text and original timing boundaries are included in the script. Captions use SDtrust. The main film copies the baseline audio stream without decoding or remixing it. Joining the Finn intro then encodes one AAC track with a 0.6 second audio crossfade. This final join changes the transition audio; the standalone `SDtrust_main_150.mp4` retains the original main audio stream.

`--jobs` defaults to 2 independent rendering processes. Each encoder uses two threads. Output includes segment MP4s, midpoint JPEGs for refreshed scenes, `SDtrust_main_150.mp4`, `SDtrust_demo_159.4.mp4` and `render-report.json`. Segment frame counts, dimensions and durations are checked automatically. The output directory is overwritten on reruns, so choose a fresh directory to retain previous renders. Review the finished video visually before sharing it. Generated output belongs under the ignored `tools/video/output/` directory.
