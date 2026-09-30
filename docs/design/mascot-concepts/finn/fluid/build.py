"""Assemble generated keyframes into registered, interpolated animation assets.

Run with numpy==2.2.3, opencv-python-headless==4.11.0.86, Pillow==11.1.0.
Source PNGs are preserved. Outputs are animation encodings, not replacement art.
"""
from pathlib import Path
import json
import os
import subprocess
import hashlib
import zipfile
import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT.parents[4] / 'apps/web/public/mascots/finn-fluid'
SIZE, HEIGHT, BASELINE = 384, 320, 352
STATES = ['welcome', 'listening', 'thinking', 'answer']
cv2.setNumThreads(4)


def registered(sheet):
    pixels = np.array(sheet)
    alpha = pixels[:, :, 3]
    # Generated rows can overlap vertically while characters remain disconnected.
    # Isolate whole alpha components, then order by grid cell, not global gutters.
    count, labels, stats, centers = cv2.connectedComponentsWithStats((alpha > 96).astype(np.uint8))
    parts = sorted(range(1, count), key=lambda i: -stats[i, 4])[:16]
    assert len(parts) == 16 and all(stats[i, 4] > 5000 for i in parts)
    parts.sort(key=lambda i: centers[i, 1])
    parts = [i for row in range(4) for i in sorted(parts[row*4:row*4+4], key=lambda i: centers[i, 0])]
    scale = HEIGHT / float((stats[parts[0], 3]+stats[parts[-1], 3])/2)
    frames = []
    for part in parts:
        x, y, w, h, _ = stats[part]
        mask = (labels == part).astype(np.uint8)
        foot_y, foot_x = np.nonzero(mask[y+h-round(h*.065):y+h])
        pivot = (foot_x.min()+foot_x.max())/2
        expanded = cv2.dilate(mask, np.ones((3, 3), np.uint8))
        rgba = pixels.copy()
        rgba[:, :, 3] *= expanded
        left, top = max(0,x-1), max(0,y-1)
        cropped = Image.fromarray(rgba).crop((left, top, min(sheet.width,x+w+1), min(sheet.height,y+h+1)))
        cropped = cropped.resize((round(cropped.width*scale), round(cropped.height*scale)), Image.Resampling.LANCZOS)
        canvas = Image.new('RGBA', (SIZE, SIZE))
        canvas.alpha_composite(cropped, (round(SIZE/2+(left-pivot)*scale), round(BASELINE+(top-y-h)*scale)))
        frames.append(np.array(canvas))
    return frames


def interpolated(keys, name, steps):
    """RIFE interpolation in black/white passes preserves transparent edges."""
    repo = ROOT.parents[4]
    binary = Path(os.environ.get('RIFE_BIN', repo / '.local/rife/rife-ncnn-vulkan-20221029-ubuntu/rife-ncnn-vulkan')).resolve()
    model = binary.parent / 'rife-v4.6'
    digest = hashlib.sha256(b''.join(key.tobytes() for key in keys)).hexdigest()[:12]
    work = repo / '.local/finn-interpolation' / f'{name}-{digest}-{steps}'
    total = len(keys)*steps+1
    for background in [0, 255]:
        inputs, outputs = work / f'in-{background}', work / f'out-{background}'
        inputs.mkdir(parents=True, exist_ok=True)
        outputs.mkdir(parents=True, exist_ok=True)
        for i, frame in enumerate(keys+[keys[0]]):
            alpha = frame[:, :, 3:4]/255
            rgb = np.clip(frame[:, :, :3]*alpha+background*(1-alpha), 0, 255).astype(np.uint8)
            Image.fromarray(rgb).save(inputs / f'{i:04d}.png')
        if len(list(outputs.glob('*.png'))) != total:
            with (work / f'rife-{background}.log').open('w') as log:
                subprocess.run([str(binary), '-i', str(inputs), '-o', str(outputs),
                                '-m', str(model), '-n', str(total), '-g', '0', '-j', '2:2:2'],
                               check=True, stdout=log, stderr=log)
    black = sorted((work / 'out-0').glob('*.png'))
    white = sorted((work / 'out-255').glob('*.png'))
    assert len(black) == len(white) == total
    frames = []
    for dark_path, light_path in zip(black[:-1], white[:-1]):
        dark = np.array(Image.open(dark_path).convert('RGB')).astype(np.float32)/255
        light = np.array(Image.open(light_path).convert('RGB')).astype(np.float32)/255
        alpha = np.clip(1-np.median(light-dark, axis=2), 0, 1)
        rgb = np.clip((dark+light-1+alpha[:, :, None])/(2*np.maximum(alpha[:, :, None], .001)), 0, 1)
        rgba = np.dstack((rgb, alpha))
        rgba[alpha < .015] = 0
        frames.append(Image.fromarray((rgba*255).astype(np.uint8)))
    return frames


def gif(frames, durations, path):
    swatches = Image.new('RGB', (64*len(frames), 64))
    for i, frame in enumerate(frames):
        swatches.paste(frame.resize((64, 64)).convert('RGB'), (i*64, 0))
    palette = swatches.quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    colors = palette.getpalette()[:765]
    palette.putpalette(colors+colors[:3])
    output = []
    for frame in frames:
        indexed = frame.convert('RGB').quantize(palette=palette, dither=Image.Dither.NONE)
        indexed = indexed.point(lambda x: 0 if x == 255 else x)
        indexed.paste(255, mask=frame.getchannel('A').point(lambda a: 255 if a < 128 else 0))
        output.append(indexed)
    output[0].save(path, save_all=True, append_images=output[1:], duration=durations,
                   transparency=255, background=255, disposal=2, loop=0, optimize=False)


def main():
    PUBLIC.mkdir(parents=True, exist_ok=True)
    metadata = []
    for name in STATES:
        path = ROOT / f'{name}-sheet.png'
        if not path.exists():
            continue
        source = Image.open(path).convert('RGBA')
        assert source.getchannel('A').getextrema()[0] == 0, 'Sheet must have real transparency'
        keys = registered(source)
        # Keep listening and thinking focused: return along the entry poses
        # rather than switching abruptly into an unrelated presenting gesture.
        order = list(range(16))
        if name == 'thinking':
            order = [0,1,2,3,4,5,6,7,6,5,4,3,2,1,0,0]
        elif name == 'listening':
            order = [1,2,3,4,3,2,1,2,3,4,3,2,1,1,1,1]
        elif name == 'answer':
            order = [0,1,2,3,4,5,6,7,8,7,6,5,4,3,2,1]
        keys = [keys[i] for i in order]
        steps = 8 if name == 'thinking' else 6
        frames = interpolated(keys, name, steps)
        # Brief breathing room at the neutral pose before the next review cycle.
        frames += [Image.fromarray(keys[0])] * 12
        webp_durations = [round((i+1)*1000/30)-round(i*1000/30) for i in range(len(frames))]
        gif_durations = [(round((i+1)*100/30)-round(i*100/30))*10 for i in range(len(frames))]
        frames[0].save(PUBLIC / f'{name}.webp', save_all=True, append_images=frames[1:],
                       duration=webp_durations, loop=0, quality=92, method=4, minimize_size=False)
        gif(frames, gif_durations, PUBLIC / f'{name}.gif')
        frames[0].save(PUBLIC / f'{name}.png')
        # Contact sheet for visual QA of the actual encoded in-between frames.
        contact = Image.new('RGB', (SIZE*4, SIZE*3), '#f8f6f1')
        for i, index in enumerate(np.linspace(0, len(frames)-13, 12, dtype=int)):
            contact.paste(frames[index], ((i%4)*SIZE, (i//4)*SIZE), frames[index])
        contact.save(ROOT / f'{name}-contact.jpg', quality=90)
        for extension in ['webp', 'gif']:
            with Image.open(PUBLIC / f'{name}.{extension}') as encoded:
                assert encoded.n_frames > 80
                assert encoded.info.get('loop') == 0
                for j in range(encoded.n_frames):
                    encoded.seek(j)
                    rgba = encoded.convert('RGBA')
                    assert rgba.getpixel((0, 0))[3] == 0
        metadata.append({'id': name, 'frames': len(frames), 'fps':30, 'durationMs':sum(webp_durations),
                         'sourceFrames':16, 'sequence':order, 'interpolation':'RIFE v4.6', 'size':SIZE, 'characterHeight':HEIGHT,
                         'displaySize':330, 'displayCharacterHeight':275})
        print(f'{name}: {len(keys)} keys -> {len(frames)} frames, {sum(webp_durations)}ms', flush=True)
    (PUBLIC / 'animations.json').write_text(json.dumps(metadata, indent=2)+'\n')
    with zipfile.ZipFile(PUBLIC / 'finn-fluid.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(PUBLIC.iterdir()):
            if path.suffix in ['.gif', '.webp', '.png', '.json', '.md']:
                archive.write(path, path.name)


if __name__ == '__main__':
    main()
