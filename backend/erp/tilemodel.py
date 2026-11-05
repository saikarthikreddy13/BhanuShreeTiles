"""3D models for "Try in your room": a patch of real-size tiles with grout lines, as a binary
glTF (.glb) file. Phones place it on the real floor or wall with AR (Android Scene Viewer or
WebXR, iPhone AR Quick Look through model-viewer), so a tile here must be its true size."""
import io
import json
import re
import struct
from math import ceil

import numpy as np
from PIL import Image, ImageDraw, ImageOps

GROUT = (222, 218, 210)
BODY = [0.80, 0.77, 0.72, 1.0]   # unglazed tile body and grout, warm grey (linear colour)
THICK = 0.009    # tile thickness, metres
JOINT = 0.003    # grout joint, metres
BEVEL = 0.0012   # rounded-off glaze edge, metres
# Metres across and deep (or high). Kept small: in AR it sits at true size close to the customer, and a
# bigger patch filled the whole phone screen.
PATCH = {"floor": (0.9, 0.9), "wall": (0.9, 0.9)}
MAX_TILES = 16


def tile_metres(size_text):
    """'600x1200 mm, 9 mm thick' -> (0.6, 1.2). Unknown sizes fall back to 600 x 600."""
    m = re.search(r"(\d{2,4})\s*x\s*(\d{2,4})", size_text or "", re.I)
    a, b = (int(m[1]), int(m[2])) if m else (600, 600)
    a, b = max(min(a, 3200), 50), max(min(b, 3200), 50)
    return a / 1000, b / 1000


def roughness(finish):
    f = (finish or "").lower()
    if re.search(r"high gloss|polish|gloss|luster|lustre|silk|infinia|mirror", f):
        return 0.12
    if re.search(r"satin|sugar|lapatto|carving|metal", f):
        return 0.4
    return 0.75


def tile_texture(photo, across, deep):
    """The photo cropped to the tile's shape, with a fine grout-coloured rim. The joints are real gaps
    in the model; the rim keeps them crisp from a distance, where a 3 mm gap is thinner than a pixel."""
    width = 1024
    height = max(64, min(2048, round(width * deep / across)))
    if height == 2048:
        width = round(height * across / deep)
    face = ImageOps.fit(ImageOps.exif_transpose(photo).convert("RGB"), (width, height), Image.LANCZOS)
    ImageDraw.Draw(face).rectangle((0, 0, width - 1, height - 1), outline=GROUT, width=max(2, width // 300))
    out = io.BytesIO()
    face.save(out, "JPEG", quality=88, optimize=True, progressive=False)
    return out.getvalue()


def build_glb(photo, size_text, finish, place="floor"):
    across, deep = tile_metres(size_text)
    if place == "wall":
        # Tilers usually lay wall tiles with the long side across.
        across, deep = max(across, deep), min(across, deep)
    # A fixed-size patch laid like a tiler would: whole tiles from one corner, cut tiles at the far
    # edges. Every tile stays its true size; only the patch is trimmed.
    width, depth = PATCH[place]
    cols = min(MAX_TILES, ceil(width / across - 1e-6))
    rows = min(MAX_TILES, ceil(depth / deep - 1e-6))
    width, depth = min(width, cols * across), min(depth, rows * deep)

    # Built lying on the floor (Y up, centred on the spot the customer picks); a wall patch is the
    # same slab stood up to face +Z, which model-viewer places with its back against the wall.
    face = {"p": [], "n": [], "t": [], "i": []}
    body = {"p": [], "n": [], "i": []}
    gap, bevel = JOINT / 2, BEVEL

    def quad(part, corners, normal, uv=None):
        base = len(part["p"])
        part["p"] += corners
        part["n"] += [normal] * 4
        if uv is not None:
            part["t"] += uv
        # Counter-clockwise seen from where the normal points, as glTF expects.
        part["i"] += [base, base + 2, base + 1, base, base + 3, base + 2]

    for r in range(rows):
        for c in range(cols):
            # How much of this tile fits; the last column and row may be cut.
            cut_x = min(across, width - c * across)
            cut_z = min(deep, depth - r * deep)
            x0 = c * across - width / 2 + gap
            x1 = c * across + cut_x - width / 2 - gap
            z0 = r * deep - depth / 2 + gap
            z1 = r * deep + cut_z - depth / 2 - gap
            u1, v1 = cut_x / across, cut_z / deep
            top, low = THICK, THICK - bevel
            ix0, ix1, iz0, iz1 = x0 + bevel, x1 - bevel, z0 + bevel, z1 - bevel
            # The glazed face, with the photo (only the part of it that remains on a cut tile).
            quad(face, [(ix0, top, iz0), (ix1, top, iz0), (ix1, top, iz1), (ix0, top, iz1)], (0, 1, 0),
                 [(0, 0), (u1, 0), (u1, v1), (0, v1)])
            # Rounded-off edges (one flat chamfer each), glazed like the face so they catch the light.
            s2 = 0.7071
            quad(face, [(x0, low, z0), (x1, low, z0), (ix1, top, iz0), (ix0, top, iz0)], (0, s2, -s2), [(0, 0)] * 4)
            quad(face, [(ix0, top, iz1), (ix1, top, iz1), (x1, low, z1), (x0, low, z1)], (0, s2, s2), [(0, v1)] * 4)
            quad(face, [(x0, low, z1), (x0, low, z0), (ix0, top, iz0), (ix0, top, iz1)], (-s2, s2, 0), [(0, 0)] * 4)
            quad(face, [(ix1, top, iz1), (ix1, top, iz0), (x1, low, z0), (x1, low, z1)], (s2, s2, 0), [(u1, 0)] * 4)
            # The tile body, seen in the joints and round the outside.
            quad(body, [(x0, 0, z0), (x1, 0, z0), (x1, low, z0), (x0, low, z0)], (0, 0, -1))
            quad(body, [(x0, low, z1), (x1, low, z1), (x1, 0, z1), (x0, 0, z1)], (0, 0, 1))
            quad(body, [(x0, 0, z1), (x0, 0, z0), (x0, low, z0), (x0, low, z1)], (-1, 0, 0))
            quad(body, [(x1, low, z1), (x1, low, z0), (x1, 0, z0), (x1, 0, z1)], (1, 0, 0))
    # The grout bed between the tiles.
    hw, hd = width / 2, depth / 2
    quad(body, [(-hw, 0.0005, -hd), (hw, 0.0005, -hd), (hw, 0.0005, hd), (-hw, 0.0005, hd)], (0, 1, 0))

    def stand(points):
        """Lying -> standing: turn 90 degrees about X so the face points at +Z, bottom edge at y = 0."""
        return [(x, hd - z, y) for x, y, z in points]

    for part in (face, body):
        if place == "wall":
            part["p"] = stand(part["p"])
            part["n"] = [(x, -z, y) for x, y, z in part["n"]]
        part["p"] = np.array(part["p"], np.float32)
        part["n"] = np.array(part["n"], np.float32)
        part["i"] = np.array(part["i"], np.uint16 if len(part["p"]) < 65536 else np.uint32)

    chunks = [face["p"].tobytes(), face["n"].tobytes(), np.array(face["t"], np.float32).tobytes(), face["i"].tobytes(),
              body["p"].tobytes(), body["n"].tobytes(), body["i"].tobytes(), tile_texture(photo, across, deep)]
    views, blob = [], b""
    for chunk in chunks:
        blob += b"\0" * (-len(blob) % 4)
        views.append({"buffer": 0, "byteOffset": len(blob), "byteLength": len(chunk)})
        blob += chunk
    blob += b"\0" * (-len(blob) % 4)
    for k in (0, 1, 2, 4, 5):
        views[k]["target"] = 34962
    views[3]["target"] = views[6]["target"] = 34963

    def accessor(view, array, kind):
        entry = {"bufferView": view, "componentType": 5126, "count": len(array), "type": kind}
        if view in (0, 4):
            entry["min"], entry["max"] = array.min(axis=0).tolist(), array.max(axis=0).tolist()
        return entry

    index_type = lambda a: 5123 if a.dtype == np.uint16 else 5125  # noqa: E731
    gltf = {
        "asset": {"version": "2.0", "generator": "Bhanu Shree Tiles"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "tiles"}],
        "meshes": [{"primitives": [
            {"attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2}, "indices": 3, "material": 0},
            {"attributes": {"POSITION": 4, "NORMAL": 5}, "indices": 6, "material": 1},
        ]}],
        "materials": [
            {"name": "glaze", "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}, "metallicFactor": 0.0,
                                                        "roughnessFactor": roughness(finish)}},
            {"name": "body", "pbrMetallicRoughness": {"baseColorFactor": BODY, "metallicFactor": 0.0, "roughnessFactor": 0.9}},
        ],
        "textures": [{"source": 0, "sampler": 0}],
        "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071}],
        "images": [{"bufferView": 7, "mimeType": "image/jpeg"}],
        "accessors": [
            accessor(0, face["p"], "VEC3"), accessor(1, face["n"], "VEC3"),
            {"bufferView": 2, "componentType": 5126, "count": len(face["t"]), "type": "VEC2"},
            {"bufferView": 3, "componentType": index_type(face["i"]), "count": len(face["i"]), "type": "SCALAR"},
            accessor(4, body["p"], "VEC3"), accessor(5, body["n"], "VEC3"),
            {"bufferView": 6, "componentType": index_type(body["i"]), "count": len(body["i"]), "type": "SCALAR"},
        ],
        "bufferViews": views,
        "buffers": [{"byteLength": len(blob)}],
    }
    text = json.dumps(gltf, separators=(",", ":")).encode()
    text += b" " * (-len(text) % 4)
    total = 12 + 8 + len(text) + 8 + len(blob)
    return (struct.pack("<4sII", b"glTF", 2, total) + struct.pack("<I4s", len(text), b"JSON") + text
            + struct.pack("<I4s", len(blob), b"BIN\0") + blob), (cols, rows, round(width, 3), round(depth, 3))
