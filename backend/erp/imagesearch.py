"""Search by photo, like shopping apps: a small image-recognition network (MobileNetV2 from the
ONNX model zoo, cut before its classifier) turns a photo into 1,280 numbers describing its look,
and tiles whose numbers are closest to the customer's photo are shown first.

Every tile photo is described once by backend/scripts/build_image_index.py, which saves
image_index.npy (the numbers) and image_index.json (which imageUrl each row belongs to).
Run it after adding tiles or photos, then commit both files."""
import json
import threading
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageOps

HERE = Path(__file__).parent
MODEL_FILE = HERE / "models" / "tile-features.onnx"
INDEX_KEYS = HERE / "image_index.json"
INDEX_VECTORS = HERE / "image_index.npy"
SIDE = 224
MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)
Image.MAX_IMAGE_PIXELS = 40_000_000

_lock = threading.Lock()
_session = None
_index = None


def _model():
    global _session
    with _lock:
        if _session is None:
            options = ort.SessionOptions()
            options.intra_op_num_threads = 2
            _session = ort.InferenceSession(str(MODEL_FILE), options, providers=["CPUExecutionProvider"])
    return _session


def _prepare(image):
    if image.format == "JPEG":
        image.draft("RGB", (SIDE * 2, SIDE * 2))
    image = ImageOps.exif_transpose(image).convert("RGB")
    # The middle of the photo: a customer's picture often shows a box edge, a hand or the floor.
    w, h = image.size
    side = int(min(w, h) * 0.75)
    left, top = (w - side) // 2, (h - side) // 2
    return image.crop((left, top, left + side, top + side)).resize((SIDE, SIDE), Image.BILINEAR)


def describe(image):
    """The photo as one unit-length vector. Mirrored and turned copies are averaged in, because
    a tile looks the same whichever way round it is photographed."""
    square = _prepare(image)
    views = [square, square.transpose(Image.FLIP_LEFT_RIGHT), square.transpose(Image.ROTATE_90)]
    batch = np.stack([(np.asarray(v, np.float32) / 255 - MEAN) / STD for v in views]).transpose(0, 3, 1, 2)
    features = _model().run(None, {"input": batch})[0].reshape(len(views), -1)
    features /= np.linalg.norm(features, axis=1, keepdims=True)
    vector = features.mean(axis=0)
    return vector / np.linalg.norm(vector)


def index():
    """(imageUrl -> row number, matrix of described photos), loaded once per server."""
    global _index
    with _lock:
        if _index is None:
            if INDEX_KEYS.exists() and INDEX_VECTORS.exists():
                keys = json.loads(INDEX_KEYS.read_text(encoding="utf-8"))
                _index = ({k: i for i, k in enumerate(keys)}, np.load(INDEX_VECTORS).astype(np.float32))
            else:
                _index = ({}, np.zeros((0, 1280), np.float32))
    return _index
