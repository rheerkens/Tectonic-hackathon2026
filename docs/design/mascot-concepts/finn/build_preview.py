"""Package the generated sprite sheets without changing their pixels.

Reads alpha bounds for frame metadata, embeds the original PNGs in an offline
preview, and builds a ZIP. Requires Pillow. Run from any working directory.
"""
from pathlib import Path
import base64
import json
import zipfile

from PIL import Image
from export_gifs import export

ROOT = Path(__file__).resolve().parent
spec_name = "animation-spec-v2.json" if (ROOT / "animation-spec-v2.json").exists() else "animation-spec.json"
spec = json.loads((ROOT / spec_name).read_text())
manifest = {key: value for key, value in spec.items() if key != "states"}
manifest["render"] = {"canvasSize": 512, "baseline": 466, "characterHeight": 424}
manifest["states"] = []
embedded = {}


def separators(projection, count):
    """Find the transparent gutter between generated rows or columns.

    The model's visual grid need not split at exact pixel subdivisions.
    Read the actual gutter so hands and shoes are never split between frames.
    """
    length = len(projection)
    cuts = [0]
    for boundary in range(1, count):
        target = length * boundary / count
        radius = length / count * 0.36
        start, end = round(target-radius), round(target+radius)
        runs, left = [], None
        for position in range(start, end):
            if not projection[position] and left is None:
                left = position
            if projection[position] and left is not None:
                runs.append((left, position))
                left = None
        if left is not None:
            runs.append((left, end))
        assert runs, f"No transparent gutter near {boundary}/{count}; inspect the generated sheet"
        best = max(runs, key=lambda run: run[1] - run[0])
        cuts.append((best[0] + best[1]) // 2)
    cuts.append(length)
    return cuts


for state in spec["states"]:
    path = ROOT / state["file"]
    im = Image.open(path)
    assert im.mode == "RGBA", f"Missing alpha: {path}"
    assert im.getchannel("A").getextrema() == (0, 255)
    width, height = im.size
    sheet_alpha = im.getchannel("A")
    sheet_solid = sheet_alpha.point(lambda a: 255 if a >= 96 else 0)
    columns = state.get("grid", {}).get("columns", 2)
    rows = state.get("grid", {}).get("rows", 2)
    row_cuts = separators(sheet_solid.getprojection()[1], rows)
    frames = []
    cells = []
    for y, end_y in zip(row_cuts, row_cuts[1:]):
        row_solid = sheet_solid.crop((0, y, width, end_y))
        column_cuts = separators(row_solid.getprojection()[0], columns)
        cells.extend((x, y, end_x-x, end_y-y) for x, end_x in zip(column_cuts, column_cuts[1:]))
    for index, (x, y, cw, ch) in enumerate(cells):
        # Analysis only: originals are copied unchanged into the package.
        alpha = im.getchannel("A").crop((x, y, x + cw, y + ch))
        solid = alpha.point(lambda a: 255 if a >= 96 else 0)
        bounds = solid.getbbox()
        assert bounds, f"Empty frame: {state['id']} {index}"
        left, top, right, bottom = bounds
        # Register against feet, not the whole silhouette: an extended hand
        # must not move the apparent center of the character.
        foot_top = max(top, bottom - round((bottom - top) * 0.065))
        foot = solid.crop((0, foot_top, cw, bottom)).getbbox()
        pivot_x = (foot[0] + foot[2]) / 2 if foot else (left + right) / 2
        pad = 2
        bounds = [max(0, left-pad), max(0, top-pad), min(cw, right+pad), min(ch, bottom+pad)]
        frames.append({"cell": [x, y, cw, ch], "bounds": bounds,
                       "pivot": [pivot_x, bottom], "characterHeight": bottom-top})
    prepared = {key: value for key, value in state.items() if key not in ("prompt", "detail")}
    prepared.update({"sheetSize": [width, height], "frames": frames})
    manifest["states"].append(prepared)
    embedded[state["id"]] = "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode()
    assert len(frames) == columns * rows
    indices = state.get("sequence", []) + (state.get("loopSequence") or []) + (state.get("exitSequence") or [])
    assert all(0 <= i < len(frames) for i in indices), "Invalid playback index"
    assert len(state["frameDurations"]) == len(frames)
    print(f"{state['id']}: {width}x{height}, {len(frames)} alpha-verified frames")

frame_count = sum(len(state["frames"]) for state in manifest["states"])
manifest["exportAtlas"] = {"columns": 4, "frameSize": 256, "frameCount": frame_count,
                           "width": 1024, "height": ((frame_count+3)//4)*256}
atlas_index = 0
for state in manifest["states"]:
    for frame in state["frames"]:
        frame["atlasCell"] = [(atlas_index % 4)*256, (atlas_index//4)*256, 256, 256]
        atlas_index += 1
(ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
export(manifest)
template = (ROOT / "preview-template.html").read_text()
payload = json.dumps({"manifest": manifest, "images": embedded}).replace("</", "<\\/")
rendered = template.replace("__FINN_DATA__", payload).replace("__FINN_PLAYER__", (ROOT / "preview-player.js").read_text())
rendered = rendered.replace("__FINN_FRAME_COUNT__", str(frame_count))
assert "__FINN_DATA__" not in rendered
(ROOT / "preview.html").write_text(rendered)
with zipfile.ZipFile(ROOT / "finn-sprites.zip", "w", zipfile.ZIP_DEFLATED) as archive:
    for name in [s["file"] for s in spec["states"]] + ["manifest.json", spec_name, "preview.html", "README.md", "preview-template.html", "preview-player.js", "build_preview.py", "export_gifs.py", "gifs.html", "finn-gifs.zip"]:
        archive.write(ROOT / name, name)
print("Wrote manifest.json, standalone preview.html, and finn-sprites.zip")
