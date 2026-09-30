"""Assemble existing Finn drawings into transparent GIFs; requires Pillow.

No new art is generated. Uses manifest registration and playback timing.
Called by build_preview.py, or run directly after rebuilding the manifest.
"""
from pathlib import Path
import base64
import html
import json
import zipfile

from PIL import Image

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT.parents[3] / 'apps/web/public/mascots/finn'
SIZE = 256


def render(sheet, frame, settings):
    x, y, _, _ = frame['cell']
    left, top, right, bottom = frame['bounds']
    px, py = frame['pivot']
    scale = settings['characterHeight'] / frame['characterHeight'] * SIZE / settings['canvasSize']
    crop = sheet.crop((x+left, y+top, x+right, y+bottom))
    crop = crop.resize((round((right-left)*scale), round((bottom-top)*scale)), Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', (SIZE, SIZE))
    position = (round(SIZE/2+(left-px)*scale), round(settings['baseline']*SIZE/settings['canvasSize']+(top-py)*scale))
    canvas.alpha_composite(crop, position)
    return canvas


def encode(frames, durations, path, loop):
    # A shared palette prevents colour flicker. Reserve index 255 for alpha.
    swatches = Image.new('RGB', (128*len(frames), 128))
    for i, frame in enumerate(frames):
        swatches.paste(frame.resize((128, 128)).convert('RGB'), (128*i, 0))
    palette = swatches.quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    colours = palette.getpalette()[:765]
    palette.putpalette(colours + colours[:3])
    indexed = []
    for frame in frames:
        target = frame.convert('RGB').quantize(palette=palette, dither=Image.Dither.NONE)
        target = target.point(lambda index: 0 if index == 255 else index)
        target.paste(255, mask=frame.getchannel('A').point(lambda a: 255 if a < 128 else 0))
        indexed.append(target)
    options = {'loop': 0} if loop else {}
    indexed[0].save(path, save_all=True, append_images=indexed[1:], duration=durations,
                    disposal=2, transparency=255, background=255, optimize=False, **options)
    # Validate encoded playback, transparency and disposal, not only source data.
    with Image.open(path) as encoded:
        assert encoded.n_frames == len(frames), path
        assert (encoded.info.get('loop') == 0) == loop, path
        actual = []
        for i in range(encoded.n_frames):
            encoded.seek(i)
            actual.append(encoded.info['duration'])
            assert encoded.disposal_method == 2
            rgba = encoded.convert('RGBA')
            assert rgba.getpixel((0, 0))[3] == 0
            assert rgba.getchannel('A').getbbox()
        assert actual == durations, (path, actual, durations)


def export(manifest):
    PUBLIC.mkdir(parents=True, exist_ok=True)
    entries, cards = [], []
    for state in manifest['states']:
        with Image.open(ROOT / state['file']) as sheet:
            frames = [render(sheet, frame, manifest['render']) for frame in state['frames']]
        # The waiting GIF loops only its chin-resting action, with no repeated entrance.
        sequence = state['loopSequence'] if state['id'] == 'thinking' else state['sequence']
        durations = [max(20, round(state['frameDurations'][i]/10)*10) for i in sequence]
        name = f"finn-{state['id']}"
        path = PUBLIC / f'{name}.gif'
        encode([frames[i] for i in sequence], durations, path, state['loop'])
        poster = PUBLIC / f'{name}.png'
        frames[state['staticFrame']].save(poster)
        entries.append({'id':state['id'], 'name':state['name'], 'src':f'/mascots/finn/{path.name}',
                        'poster':f'/mascots/finn/{poster.name}', 'width':SIZE, 'height':SIZE,
                        'loop':state['loop'], 'durationMs':sum(durations), 'sourceSequence':sequence,
                        'frameDurationsMs':durations, 'nextState':state['nextState']})
        gif = 'data:image/gif;base64,' + base64.b64encode(path.read_bytes()).decode()
        still = 'data:image/png;base64,' + base64.b64encode(poster.read_bytes()).decode()
        title = html.escape(state['name'])
        kind = 'Continuous loop' if state['loop'] else 'Plays once · replay to review'
        cards.append(f'''<article><h2>{title}</h2><img width="256" height="256" alt="Finn: {title}" src="{still}" data-gif="{gif}" data-poster="{still}"><p>{kind} · {sum(durations)/1000:g}s</p><div><button type="button">Replay</button> <a href="{gif}" download="{path.name}">Download GIF</a></div></article>''')
        print(f'{path.relative_to(ROOT.parents[3])}: {len(sequence)} frames, {sum(durations)} ms, {path.stat().st_size:,} bytes')
    metadata = {'size':SIZE, 'transparency':'GIF binary alpha', 'animations':entries}
    (PUBLIC / 'animations.json').write_text(json.dumps(metadata, indent=2)+'\n')
    (PUBLIC / 'README.md').write_text('''# Finn GIF assets

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
''')
    page = '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Finn · GIF animations</title><style>
:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#fcfaf6;color:#252322;font:16px/1.5 system-ui,sans-serif}main{max-width:1160px;margin:auto;padding:32px 24px}h1{font-size:36px;margin:0 0 12px;letter-spacing:-.035em}h2{font-size:18px;margin:0}p{color:#68615b}a{color:#b90028;text-underline-offset:4px}nav{display:flex;gap:20px;flex-wrap:wrap;margin:20px 0}button{font:inherit;padding:8px 14px;background:#252322;color:white;border:0;border-radius:6px;cursor:pointer}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px}article{padding:20px;border:1px solid #ded8ce;border-radius:12px;background:#fff}article img{display:block;width:100%;height:auto;max-width:256px;margin:12px auto;background:#f2ece0;border-radius:8px}article p{font-size:13px}article div{display:flex;gap:16px;align-items:center}article a{font-size:13px}:focus-visible{outline:3px solid #b90028;outline-offset:3px}</style><main><h1>Finn, ready to drop into the app.</h1><p>Eight transparent GIFs, 256 × 256 pixels. Idle blinks first, then rests; thinking loops continuously. Other gestures play once.</p><nav><button id="motion" type="button">Pause all</button><a href="finn-gifs.zip" download>Download all GIFs + static PNGs</a><a href="preview.html">Open sprite player</a></nav><p id="status" aria-live="polite"></p><section class="grid">''' + ''.join(cards) + '''</section></main><script>
const images=[...document.querySelectorAll('article img')], preference=matchMedia('(prefers-reduced-motion: reduce)');
let paused=preference.matches;
function play(img){if(img.objectUrl)URL.revokeObjectURL(img.objectUrl);if(!img.gifBlob){const bytes=Uint8Array.from(atob(img.dataset.gif.split(',')[1]),char=>char.charCodeAt(0));img.gifBlob=new Blob([bytes],{type:'image/gif'})}img.objectUrl=URL.createObjectURL(img.gifBlob);img.src=img.objectUrl;}
function update(){images.forEach(img=>{if(paused){img.src=img.dataset.poster}else{play(img)}});document.getElementById('motion').textContent=paused?'Play all':'Pause all';document.getElementById('status').textContent=paused?'Static poses shown.':'Idle and thinking loop. Use Replay for the other gestures.';}
document.getElementById('motion').onclick=()=>{paused=!paused;update()};
document.querySelectorAll('article button').forEach(button=>button.onclick=()=>{const img=button.closest('article').querySelector('img');if(paused){paused=false;update()}play(img)});
preference.addEventListener('change',event=>{paused=event.matches;update()});update();
</script></html>'''
    (ROOT / 'gifs.html').write_text(page)
    with zipfile.ZipFile(ROOT / 'finn-gifs.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(PUBLIC.iterdir()):
            if path.suffix in ('.gif', '.png', '.json', '.md'):
                archive.write(path, path.name)
        archive.write(ROOT / 'gifs.html', 'gifs.html')
    return entries


if __name__ == '__main__':
    export(json.loads((ROOT / 'manifest.json').read_text()))
