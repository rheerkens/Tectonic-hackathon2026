# Finn animation delivery

The approved GIF URLs remain compatible. For web playback, use `/mascots/finn/web-animations.json`. It provides hashed WebM, WebP fallback and small poster URLs for the four fluid gestures. The other four entries retain their existing GIFs.

## Measured payloads

Exact file bytes, measured locally on 2026-09-30. These are asset sizes, not a claim about production load times.

| Gesture | Original review WebP | Transparent WebM | Reduction |
| --- | ---: | ---: | ---: |
| welcome | 2,831,174 | 333,206 | 88.2% |
| listening | 2,903,004 | 278,183 | 90.4% |
| thinking | 3,485,960 | 309,605 | 91.1% |
| answer | 2,815,622 | 317,055 | 88.7% |

The preview previously downloaded a 2.83 MB welcome WebP (991 ms in the collaborative browser on the local network). The optimized player loads only the selected video and poster; no animated WebP is downloaded when transparent video works. The old GIF on the left is an intentional comparison-only cost. GIFs and the ZIP download only when requested.

## Delivery behavior

- Keep the approved 384×384 resolution, 30 fps timing and approximately 275 CSS pixel character height. VP9 temporal compression produces the largest saving. GIF export files are unchanged.
- Use `videoSrc` in a muted, inline video with `preload="none"`; set `loop` from metadata in a product integration. The comparison deliberately loops every gesture.
- Check both codec support and a decoded transparent corner: some decoders support VP9 without alpha. Fall back to `src` (one-shot or loop as specified). `reviewSrc` always loops for the review page.
- Use `poster` for reduced motion and initially when Save-Data is enabled. No animation request is made until the user explicitly presses play. Stop animation when the document is hidden.
- Hashed assets live under `/assets/finn/`, using the existing production static handler’s `public, max-age=31536000, immutable` cache policy. Metadata stays revalidated. Replaying reuses browser or in-memory cached data without random cache-busting URLs. A repeated full-file browser fetch transferred 0 bytes after the first 333,206-byte welcome response.
- Do not preload all states. Show the small poster immediately while the selected animation loads. Keep the reserved image dimensions to prevent layout shift.

The script uses Pillow’s [WebP encoding options](https://pillow.readthedocs.io/en/stable/handbook/image-file-formats.html#webp). Hashed URLs allow safe [immutable caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control#immutable).

## Rebuild and validation

Run `python docs/design/mascot-concepts/finn/fluid/build_web.py` after rebuilding the approved assets. Requires Pillow 11.1.0 and ffmpeg with `libvpx-vp9`; no runtime dependency is added. The script emits content hashes and removes obsolete files in its own `assets/finn` directory.

Browser review used Chromium against the built app served through the actual production static handler. Checked all four gestures, decoded transparency, WebP fallback, pause/replay, reduced-motion handling, and cache headers. Safari/Firefox and real mobile network performance were not measured. WebP is the fallback if video or alpha decoding is unavailable.
