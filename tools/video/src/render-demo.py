#!/usr/bin/env python3
"""Rebuild the approved SDtrust demo from real UI captures and existing media."""
import argparse
from concurrent.futures import ProcessPoolExecutor
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import textwrap

import numpy as np
from PIL import Image, ImageDraw, ImageFont

FPS = 60
DURATIONS = [13, 15, 14, 14, 15, 13, 15, 13, 12, 12, 14]
RAW = [0, 15.8, 33.3, 49.5, 65.7, 82.75, 98, 114.85, 129.4, 143.5, 155.6, 171.885688]
TITLES = ['Welke bron klopt?', 'De juiste context', 'Gesprekken in Teams',
          'Berichten in Outlook', 'Documenten in SharePoint', 'Regels in een handboek',
          'Een onderbouwd antwoord', 'Verschillen zichtbaar maken',
          'De juiste persoon vinden', 'Toegang tot kennis', 'Van antwoord naar vertrouwen']
SCENES = {'context': (1, 13, 15), 'answer': (6, 84, 15),
          'differences': (7, 99, 13), 'owner': (8, 120, 4),
          'access': (9, 132, 4), 'ending': (10, 136, 14)}
PRESERVED = {'old_open': (0, 13), 'old_sources': (28, 56),
             'old_experts': (112, 8), 'old_access': (124, 8)}
ORDER = ['old_open', 'context', 'old_sources', 'answer', 'differences',
         'old_experts', 'owner', 'old_access', 'access', 'ending']
CORRECT = [
    'Welke bron klopt?',
    'Een afspraak in Teams, een mail van gisteren, of de procedure in SharePoint?',
    'Voor een payrollconsultant kan het antwoord afhangen van de klant, het land en de periode.',
    'Stel je vraag aan SDtrust.',
    'Bijvoorbeeld:',
    'Tot wanneer mag Atlas loonmutaties aanleveren?',
    'Selecteer België, de klant Atlas en oktober.',
    'Zo begint je zoektocht met de juiste context.',
    'In Teams kunnen belangrijke afspraken tussen dagelijkse gesprekken staan.',
    'De agentanimatie laat zien hoe een gesprek wordt gelezen en verwijzingen worden gevolgd.',
    'Dit is een illustratie met openbare voorbeeldbeelden.',
    'Ook e-mails kunnen aanvullende informatie bevatten.',
    'Een bericht geeft context, maar is daarmee nog geen bevestigde afspraak.',
    'Afzender, inhoud en verwijzingen helpen je begrijpen waar informatie vandaan komt.',
    'In SharePoint staan documenten naast elkaar.',
    'Welke versie geldt?',
    'Is het document gepubliceerd?',
    'En gaat het over dezelfde situatie?',
    'De animatie maakt zichtbaar waarom broncontrole verder gaat dan een zoekresultaat.',
    'Een handboek biedt weer andere context.',
    'Daarin kunnen algemene regels en beleidsafspraken staan.',
    'Die vormen het vertrekpunt, maar een goedgekeurde klantafspraak kan een uitzondering bevatten.',
    'Terug in het huidige platform zie je het onderbouwde antwoord:',
    'Tweeëntwintig oktober.',
    'Voor Atlas geldt een goedgekeurde uitzondering op de algemene aanleverdatum van twintig oktober.',
    'De bron staat er direct bij.',
    'Je ziet ook waarom andere informatie afvalt.',
    'Een Teamsgesprek is niet bevestigd.',
    'Een oude procedure is vervangen.',
    'Een document voor Nederland past niet bij een Belgische vraag.',
    'En wie kan duidelijkheid geven?',
    'Organisatieprofielen helpen de juiste persoon te vinden.',
    'In SDtrust zie je de verantwoordelijke bij de bron en kun je om verduidelijking vragen.',
    'Toegangsrechten blijven onderdeel van het verhaal.',
    'De animatie toont hoe rechten worden bekeken.',
    'In het platform bepaalt je teamtoegang welke bronnen beschikbaar zijn.',
    'Zo wordt verspreide kennis een helder, onderbouwd antwoord.',
    'Met zicht op de bron, de geldigheid en de verantwoordelijke.',
    'Jij houdt de controle.',
    'SDtrust. Van antwoord naar vertrouwen.',
]


def run(command):
    subprocess.run(command, check=True)


def probe(path):
    return json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)]))


def validate_video(path, duration, audio=False, rendered=False):
    info = probe(path)
    video = next(s for s in info['streams'] if s['codec_type'] == 'video')
    if (video['width'], video['height']) != (1920, 1080):
        raise ValueError(f'{path}: expected 1920 by 1080')
    if abs(float(info['format']['duration']) - duration) > .05:
        raise ValueError(f'{path}: expected {duration} seconds')
    if audio and not any(s['codec_type'] == 'audio' for s in info['streams']):
        raise ValueError(f'{path}: missing original audio')
    if rendered and (video['r_frame_rate'] != '60/1'
                     or int(video.get('nb_frames', 0)) != round(duration * FPS)
                     or video.get('sample_aspect_ratio') != '1:1'
                     or video.get('pix_fmt') != 'yuv420p'):
        raise ValueError(f'{path}: incorrect frame count, frame rate or pixel format')
    return info


def encoding():
    return ['-c:v', 'libx264', '-threads', '2', '-preset', 'fast', '-crf', '16',
            '-pix_fmt', 'yuv420p', '-movflags', '+faststart']


def initialize(args):
    global ARGS, STYLE, BG, LOGO, CUES, FONTS
    ARGS = args
    STYLE = json.loads(args.style.read_text(encoding='utf-8'))
    FONTS = {}
    yy, xx = np.mgrid[0:1080, 0:1920]
    background = STYLE['background']
    cx, cy = background['center']
    rx, ry = background['radius']
    glow = np.exp(-(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2))
    BG = Image.fromarray(np.stack([
        v + glow * d for v, d in zip(background['base_rgb'], background['glow_rgb'])
    ], axis=2).astype('uint8'))
    with Image.open(args.assets / 'merk_reverse.png') as original:
        LOGO = original.convert('RGBA')
    LOGO = LOGO.crop(LOGO.getbbox())
    transcript = json.loads((args.assets / 'transcript_lang.json').read_text(encoding='utf-8'))
    if len(transcript) != len(CORRECT):
        raise ValueError('The transcript must match the 40 approved narration cues')
    starts = [sum(DURATIONS[:i]) for i in range(len(DURATIONS))]
    CUES = []
    narration = CORRECT.copy()
    if args.context_audio:
        narration[6] = 'Finn herkent België, de klant Atlas en oktober.'
    for item, words in zip(transcript, narration):
        a, b = float(item['start']), float(item['end'])
        if not (math.isfinite(a) and math.isfinite(b) and 0 <= a <= b <= RAW[-1]):
            raise ValueError(f'Invalid transcript interval: {item}')
        i = max(j for j, raw in enumerate(RAW[:-1]) if a >= raw)
        speed = (RAW[i + 1] - RAW[i]) / (DURATIONS[i] - (1.3 if i == 10 else .5))
        CUES.append((starts[i] + .25 + (a - RAW[i]) / speed,
                     starts[i] + .25 + (b - RAW[i]) / speed, words))


def text(draw, xy, words, size=30, fill='white', bold=False, anchor=None):
    key = (size, bold)
    if key not in FONTS:
        filename = STYLE['font']['bold_file' if bold else 'regular_file']
        FONTS[key] = ImageFont.truetype(str(ARGS.font_dir / filename), size)
    draw.text(xy, words, font=FONTS[key], fill=fill, anchor=anchor)


def ease(t):
    t = max(0, min(1, t))
    return t * t * (3 - 2 * t)


def logo(im, box):
    mark = LOGO.copy()
    mark.thumbnail(tuple(box[2:]), Image.Resampling.LANCZOS)
    im.paste(mark, tuple(box[:2]), mark)


def base(index):
    im = BG.copy()
    draw = ImageDraw.Draw(im)
    logo(im, STYLE['header']['logo_box'])
    text(draw, tuple(STYLE['header']['title_origin']), TITLES[index],
         STYLE['header']['title_size'], bold=True)
    if index not in (0, 2, 3, 4, 5, 8, 9):
        text(draw, (1680, 29), 'Huidig platform · fictieve demogegevens',
             20, '#c9c6e1', anchor='ra')
    return im


def ending(t):
    im = base(10)
    draw = ImageDraw.Draw(im)
    for radius in (285, 400, 515):
        radius += 7 * (t - 5.5)
        draw.ellipse((960 - radius, 480 - radius, 960 + radius, 480 + radius),
                     outline='#2a2b4b', width=2)
    logo(im, (620, 305, 680, 200))
    text(draw, (960, 598), 'Van antwoord naar vertrouwen.', 58, bold=True, anchor='mm')
    text(draw, (960, 690), 'Bron · Geldigheid · Verantwoordelijke',
         31, STYLE['colors']['body'], anchor='mm')
    draw.rounded_rectangle((820, 755, 1100, 759), 2, fill=STYLE['colors']['accent'])
    return im


def subtitles(im, t):
    draw = ImageDraw.Draw(im)
    for start, end, words in CUES:
        if start <= t < end:
            lines = textwrap.wrap(words, 80)
            for n, line in enumerate(lines):
                text(draw, (960, 998 + n * 36 if len(lines) > 1 else 1015),
                     line, 29, bold=True, anchor='mm')
            break
    draw.rectangle((240, 1074, 1680, 1077), fill='#303046')
    draw.rectangle((240, 1074, 240 + 1440 * t / 150, 1077), fill=STYLE['colors']['accent'])


def render(name):
    output = ARGS.output / f'{name}.mp4'
    if name in PRESERVED:
        start, duration = PRESERVED[name]
        run(['ffmpeg', '-v', 'error', '-y', '-ss', str(start), '-i', str(ARGS.baseline),
             '-t', str(duration), '-an', '-vf', 'scale=1920:1080,setsar=1,fps=60',
             *encoding(), str(output)])
    else:
        render_scene(name, output)
        duration = SCENES[name][2]
    info = validate_video(output, duration, rendered=True)
    print(f'{name}: {duration}s, {duration * FPS} frames', flush=True)
    return name, info


def render_scene(name, output):
    index, start, duration = SCENES[name]
    reader = None
    if name == 'context':
        reader = subprocess.Popen(['ffmpeg', '-v', 'error', '-i',
            str(ARGS.captures / 'capture/context_clean.mp4'), '-vf', 'fps=60,scale=1440:900',
            '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
    else:
        filename = {'answer': 'capture/answer-focused.png', 'ending': 'capture/answer-focused.png',
                    'differences': 'capture/differences.png',
                    'owner': 'details/atlas-owner-validity-2x.png',
                    'access': 'details/atlas-access-2x.png'}[name]
        with Image.open(ARGS.captures / filename) as original:
            picture = original.convert('RGB')
        box = {'owner': (400, 485, 1040, 885), 'access': (400, 485, 1040, 885),
               'differences': (285, 178.125, 1440, 900)}.get(name, (285, 40, 1440, 761.875))
        scale = picture.width / 1440
        ui = picture.transform((1440, 900), Image.Transform.EXTENT,
                               tuple(q * scale for q in box), Image.Resampling.BICUBIC)
    encoder = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo',
        '-pix_fmt', 'rgb24', '-s', '1920x1080', '-r', '60', '-i', '-', '-an',
        '-vf', 'setsar=1', *encoding(), str(output)], stdin=subprocess.PIPE)
    try:
        for frame in range(duration * FPS):
            t = frame / FPS
            if reader:
                raw = reader.stdout.read(1440 * 900 * 3)
                if len(raw) != 1440 * 900 * 3:
                    raise ValueError('Context capture must contain all 15 seconds')
                ui = Image.frombytes('RGB', (1440, 900), raw)
            im = base(index)
            im.paste(ui, (240, 70))
            if name == 'differences' and t >= 3.5:
                row = 754 if t < 6 else (813 if t < 8.6 else 872)
                y = 70 + (row - 178.125) / 721.875 * 900
                ImageDraw.Draw(im).rounded_rectangle((252, y - 30, 1668, y + 30), 8,
                    outline=STYLE['colors']['accent'], width=3)
            if name == 'ending' and t >= 5.5:
                end = ending(max(t, 6.1))
                im = Image.blend(im, end, ease((t - 5.5) / .6)) if t < 6.1 else end
            fade = min(ease(t / .3), ease((duration - 1 / FPS - t) / .3))
            if fade < 1:
                im = Image.blend(BG, im, fade)
            subtitles(im, start + t)
            if frame == duration * FPS // 2:
                im.save(ARGS.output / f'{name}.jpg', quality=95)
            encoder.stdin.write(im.tobytes())
        encoder.stdin.close()
        if encoder.wait() != 0:
            raise RuntimeError(f'FFmpeg failed encoding {name}')
        if reader:
            reader.stdout.close()
            if reader.wait() != 0:
                raise RuntimeError('FFmpeg failed decoding context capture')
    finally:
        for process in (encoder, reader):
            if process is not None and process.poll() is None:
                process.kill()
                process.wait()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('assets', 'captures', 'baseline', 'intro', 'output'):
        parser.add_argument(f'--{name}', type=Path, required=True)
    parser.add_argument('--font-dir', type=Path,
                        default=Path(os.environ.get('WINDIR', 'C:/Windows')) / 'Fonts')
    parser.add_argument('--style', type=Path, default=Path(__file__).resolve().parents[1] / 'style.json')
    parser.add_argument('--jobs', type=int, default=2)
    parser.add_argument('--context-audio', type=Path,
                        help='Optional 15 second stereo mix replacing main seconds 13 through 28')
    args = parser.parse_args()
    if args.jobs < 1:
        parser.error('--jobs must be at least 1')
    for executable in ('ffmpeg', 'ffprobe'):
        if not shutil.which(executable):
            parser.error(f'{executable} must be on PATH')
    required = [args.baseline, args.intro, args.style, args.assets / 'transcript_lang.json',
                args.assets / 'merk_reverse.png']
    if args.context_audio:
        required.append(args.context_audio)
    required += [args.captures / filename for filename in (
        'capture/context_clean.mp4', 'capture/answer-focused.png', 'capture/differences.png',
        'details/atlas-owner-validity-2x.png', 'details/atlas-access-2x.png')]
    for path in required:
        if not path.is_file():
            parser.error(f'Missing input: {path}')
    style = json.loads(args.style.read_text(encoding='utf-8'))
    if float(style['motion']['transition_seconds']) != .6:
        parser.error('The approved composition requires a 0.6 second transition')
    for key in ('regular_file', 'bold_file'):
        if not (args.font_dir / style['font'][key]).is_file():
            parser.error(f'Missing font {style["font"][key]}; provide --font-dir')
    validate_video(args.baseline, 150, audio=True)
    validate_video(args.intro, 10, audio=True)
    if args.context_audio:
        info = probe(args.context_audio)
        audio = next((s for s in info['streams'] if s['codec_type'] == 'audio'), None)
        if audio is None or audio.get('channels') != 2 or abs(float(info['format']['duration']) - 15) > .05:
            parser.error('--context-audio must contain 15 seconds of stereo audio')
    generated = [args.output / f'{name}.mp4' for name in ORDER]
    generated += [args.output / 'SDtrust_main_150.mp4', args.output / 'SDtrust_demo_159.4.mp4']
    if {path.resolve() for path in generated} & {path.resolve() for path in required}:
        parser.error('Output would overwrite an input; choose a different output directory')
    args.output.mkdir(parents=True, exist_ok=True)
    with ProcessPoolExecutor(max_workers=args.jobs, initializer=initialize, initargs=(args,)) as pool:
        reports = dict(pool.map(render, ORDER))
    # Safe relative names, generated here rather than interpolating external file names.
    listing = args.output / 'segments.txt'
    listing.write_text(''.join(f"file '{name}.mp4'\n" for name in ORDER), encoding='utf-8')
    main_video = args.output / 'SDtrust_main_150.mp4'
    audio = ['-map', '0:v:0', '-map', '1:a:0', '-c', 'copy']
    if args.context_audio:
        filters = ('[1:a:0]atrim=start=0:end=13,asetpts=PTS-STARTPTS[before];'
                   '[2:a:0]atrim=start=0:end=15,asetpts=PTS-STARTPTS[context];'
                   '[1:a:0]atrim=start=28:end=150,asetpts=PTS-STARTPTS[after];'
                   '[before][context][after]concat=n=3:v=0:a=1[a]')
        audio = ['-i', str(args.context_audio), '-filter_complex', filters,
                 '-map', '0:v:0', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac',
                 '-b:a', '256k', '-ar', '48000', '-ac', '2']
    run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', str(listing),
         '-i', str(args.baseline), *audio,
         '-t', '150', '-movflags', '+faststart', str(main_video)])
    reports['main'] = validate_video(main_video, 150, audio=True, rendered=True)
    final_video = args.output / 'SDtrust_demo_159.4.mp4'
    filters = ('[0:v]fps=60,setsar=1,settb=AVTB,setpts=PTS-STARTPTS[intro];'
               '[1:v]fps=60,setsar=1,settb=AVTB,setpts=PTS-STARTPTS[main];'
               '[intro][main]xfade=transition=fade:duration=0.6:offset=9.4[v];'
               '[0:a][1:a]acrossfade=d=0.6:c1=tri:c2=tri[a]')
    run(['ffmpeg', '-v', 'error', '-y', '-i', str(args.intro), '-i', str(main_video),
         '-filter_complex_threads', '2', '-filter_complex', filters, '-map', '[v]', '-map', '[a]',
         *encoding(), '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-t', '159.4', str(final_video)])
    reports['final'] = validate_video(final_video, 159.4, audio=True, rendered=True)
    (args.output / 'render-report.json').write_text(json.dumps(reports, indent=2), encoding='utf-8')
    print(final_video)


if __name__ == '__main__':
    main()
