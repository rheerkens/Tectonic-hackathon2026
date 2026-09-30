"""Encode web delivery assets without changing the approved GIF downloads.

Requires Pillow 11.1.0 and ffmpeg with libvpx-vp9. Run after build.py/export_gifs.py.
"""
from pathlib import Path
import hashlib
import io
import json
import re
import subprocess
import tempfile

from PIL import Image

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[4]
PUBLIC = REPO / 'apps/web/public'
OUTPUT = PUBLIC / 'assets/finn'
STATES = ('welcome', 'listening', 'thinking', 'answer')


def publish(name, extension, data):
    digest = hashlib.sha256(data).hexdigest()[:16]
    target = OUTPUT / f'{name}-{digest}.{extension}'
    target.write_bytes(data)
    return '/' + str(target.relative_to(PUBLIC))


def webp_loop(data, loop):
    """Change only WebP's ANIM loop count; keep the compressed frames identical."""
    data = bytearray(data)
    offset = 12
    while offset < len(data):
        size = int.from_bytes(data[offset+4:offset+8], 'little')
        if data[offset:offset+4] == b'ANIM':
            data[offset+12:offset+14] = loop.to_bytes(2, 'little')
            return bytes(data)
        offset += 8 + size + size % 2
    raise ValueError('Missing WebP animation header')


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((PUBLIC / 'mascots/finn/animations.json').read_text())
    for entry in manifest['animations']:
        name = entry['id']
        if name not in STATES:
            # Publish the small GIF poses under hashed URLs too, so they get the immutable cache policy.
            for key, extension in (('src', 'gif'), ('poster', 'png')):
                entry[key] = publish(name if key == 'src' else name+'-poster', extension, (PUBLIC / entry[key].lstrip('/')).read_bytes())
            continue
        source = PUBLIC / f'mascots/finn-fluid/{name}.webp'
        frames, durations = [], []
        with Image.open(source) as image:
            for index in range(image.n_frames):
                image.seek(index)
                frames.append(image.convert('RGBA'))
                durations.append(image.info['duration'])
        # Keep all frames, source resolution and alpha. Video adds temporal compression.
        with tempfile.TemporaryDirectory(prefix='finn-web-') as directory:
            work = Path(directory)
            lines = []
            for index, (frame, duration) in enumerate(zip(frames, durations)):
                frame.save(work / f'{index:04d}.png')
                lines.extend((f"file '{index:04d}.png'", 'option framerate 1000', f'duration {duration/1000}'))
            lines.extend((f"file '{len(frames)-1:04d}.png'", 'option framerate 1000'))
            (work / 'frames.txt').write_text('\n'.join(lines) + '\n')
            subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
                            '-f', 'concat', '-safe', '0', '-i', str(work / 'frames.txt'),
                            '-vf', 'fps=30', '-t', str(sum(durations)/1000),
                            '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-crf', '12',
                            '-b:v', '0', '-auto-alt-ref', '0', '-row-mt', '1', '-an',
                            '-deadline', 'good', '-cpu-used', '2', str(work / 'animation.webm')], check=True)
            video = (work / 'animation.webm').read_bytes()
        buffer = io.BytesIO()
        frames[0].save(buffer, format='WEBP', save_all=True, append_images=frames[1:],
                       duration=durations, loop=0, quality=80, method=4, minimize_size=True)
        review = buffer.getvalue()
        playback = review if entry['loop'] else webp_loop(review, 1)
        poster = io.BytesIO()
        frames[0].save(poster, format='WEBP', quality=95, method=6)
        entry.update({
            'gif': entry['src'],
            'src': publish(name, 'webp', playback),
            'reviewSrc': publish(name+'-review', 'webp', review) if not entry['loop'] else publish(name, 'webp', review),
            'videoSrc': publish(name, 'webm', video),
            'poster': publish(name+'-poster', 'webp', poster.getvalue()),
            'durationMs': sum(durations), 'frameDurationsMs': durations,
            'bytes': {'video': len(video), 'webp': len(playback), 'originalWebp': source.stat().st_size},
        })
        with Image.open(io.BytesIO(playback)) as encoded:
            assert encoded.info['loop'] == (0 if entry['loop'] else 1)
            assert encoded.size == (entry['width'], entry['height'])
            assert encoded.n_frames > 80
        print(name, entry['bytes'], flush=True)
    manifest['transparency'] = 'WebM/WebP alpha; legacy GIF binary alpha'
    manifest['delivery'] = 'Prefer videoSrc with verified alpha support; otherwise src. Use poster for reduced motion. Set video.loop from loop.'
    (PUBLIC / 'mascots/finn/web-animations.json').write_text(json.dumps(manifest, indent=2)+'\n')
    # Give the initial HTML a lightweight, immutable poster before JS loads metadata.
    page = PUBLIC / 'finn-motion.html'
    welcome = next(entry for entry in manifest['animations'] if entry['id'] == 'welcome')
    page.write_text(re.sub(r'(<img id="new"[^>]*?src=")[^"]+', lambda match: match[1]+welcome['poster'], page.read_text()))
    # Only this script owns assets/finn. Remove obsolete content hashes after publishing.
    referenced = {Path(entry[key]).name for entry in manifest['animations'] for key in ('src','reviewSrc','videoSrc','poster') if key in entry}
    for path in OUTPUT.iterdir():
        if path.name not in referenced:
            path.unlink()


if __name__ == '__main__':
    main()
