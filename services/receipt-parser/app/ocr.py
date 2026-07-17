"""OCR transcription via RapidOCR (PaddleOCR's models on ONNX Runtime, CPU).

Isolated behind transcribe() so the engine can be swapped without touching the
pipeline. Never raises: disabled, missing, or failing OCR returns None — the
caller falls back to pure-vision extraction.
"""

from __future__ import annotations

import logging
from functools import cache

import numpy as np
from PIL import Image

from app.config import settings

logger = logging.getLogger(__name__)

# A detected word joins the current text line when its y-center is within this
# fraction of its own height from the line's running y-center.
LINE_MERGE_FACTOR = 0.6


@cache
def _engine():
    from rapidocr_onnxruntime import RapidOCR

    return RapidOCR()


def _group_lines(results: list) -> str:
    """Rebuild text lines from (box, text, score) triples.

    Word boxes are grouped into lines by y-center proximity, each line sorted by
    x — preserving the "name …… price" row structure of receipts.
    """
    words: list[tuple[float, float, float, str]] = []  # (x_left, y_center, height, text)
    for box, text, _score in results:
        text = str(text).strip()
        if not text:
            continue
        xs = [point[0] for point in box]
        ys = [point[1] for point in box]
        words.append((min(xs), (min(ys) + max(ys)) / 2, max(ys) - min(ys), text))
    words.sort(key=lambda word: word[1])

    lines: list[list[tuple[float, float, float, str]]] = []
    centers: list[float] = []
    for word in words:
        x_left, y_center, height, _text = word
        if lines and abs(y_center - centers[-1]) <= max(height, 1.0) * LINE_MERGE_FACTOR:
            lines[-1].append(word)
            centers[-1] = sum(w[1] for w in lines[-1]) / len(lines[-1])
        else:
            lines.append([word])
            centers.append(y_center)

    for line in lines:
        line.sort(key=lambda w: w[0])
    return '\n'.join(' '.join(w[3] for w in line) for line in lines)


def transcribe(image: Image.Image) -> str | None:
    """OCR one image into a line-structured transcript, or None when unavailable."""
    if not settings.ocr_enabled:
        return None
    try:
        results, _elapse = _engine()(np.asarray(image.convert('RGB')))
    except Exception:  # noqa: BLE001 - OCR must degrade, never break the request
        logger.exception('OCR transcription failed; continuing without a transcript.')
        return None
    if not results:
        return None
    return _group_lines(results) or None
