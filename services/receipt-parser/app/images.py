"""Decode an uploaded file into one or more base64 PNG images for the model.

Supported: JPEG, PNG, WebP, HEIC (via pillow-heif), and PDF (each page rendered
to an image via pypdfium2, then merged as separate images in the prompt).
"""

from __future__ import annotations

import base64
import io
from dataclasses import dataclass

import pypdfium2 as pdfium
from PIL import Image
from pillow_heif import register_heif_opener

from app import ocr
from app.config import settings
from app.errors import UnreadableInput, UnsupportedMediaType

register_heif_opener()

IMAGE_TYPES = {'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'}
PDF_TYPES = {'application/pdf'}
SUPPORTED_TYPES = IMAGE_TYPES | PDF_TYPES


@dataclass(frozen=True)
class DecodedInput:
    """Everything decoded from one upload: model-ready images plus an optional
    machine-extracted transcript used for deterministic grounding checks."""

    images_b64: list[str]
    transcript: str | None = None
    transcript_source: str | None = None  # 'pdf_text' | 'ocr' | None
    multi_page_truncated: bool = False
    # True when OCR would have grounded this input but produced nothing
    # (disabled, broken, or no detections) — extraction is vision-only.
    ocr_unavailable: bool = False


# A PDF whose pages average more extracted characters than this is treated as
# born-digital (email receipt/invoice): its text layer is the transcript and no
# OCR is needed. Scanned PDFs typically extract nothing at all.
PDF_TEXT_MIN_CHARS_PER_PAGE = 80

# Long thermal receipts get downscaled into illegibility by vision encoders.
# Images beyond both bounds are split into vertical tiles that overlap enough
# for no row to be lost at a seam.
TILE_MAX_ASPECT = 2.5  # height/width ratio above which tiling kicks in
TILE_MIN_HEIGHT = 2000  # px — short images are never tiled
TILE_OVERLAP = 0.15


def _tile_tall_image(image: Image.Image) -> list[Image.Image]:
    """Split an extreme-aspect image into overlapping vertical tiles (or return it whole)."""
    width, height = image.size
    if height <= TILE_MIN_HEIGHT or height <= width * TILE_MAX_ASPECT:
        return [image]
    tile_height = int(width * TILE_MAX_ASPECT)
    step = max(1, int(tile_height * (1 - TILE_OVERLAP)))
    tops = list(range(0, height - tile_height, step))
    tops.append(height - tile_height)  # final tile is bottom-aligned so nothing is cut off
    return [image.crop((0, top, width, top + tile_height)) for top in tops]


def _pdf_page_text(page: pdfium.PdfPage) -> str:
    try:
        return page.get_textpage().get_text_bounded() or ''
    except Exception:  # noqa: BLE001 - a broken text layer must not break rendering
        return ''


def _encode_png(image: Image.Image) -> str:
    if image.mode not in ('RGB', 'L'):
        image = image.convert('RGB')
    buffer = io.BytesIO()
    image.save(buffer, format='PNG')
    return base64.b64encode(buffer.getvalue()).decode('ascii')


def _render_pdf(data: bytes) -> DecodedInput:
    """Render up to pdf_max_pages PDF pages to PNGs."""
    try:
        pdf = pdfium.PdfDocument(data)
    except Exception as exc:  # noqa: BLE001 - pdfium raises bare exceptions
        raise UnreadableInput('The PDF could not be opened.') from exc

    page_count = len(pdf)
    truncated = page_count > settings.pdf_max_pages
    pages: list[Image.Image] = []
    page_texts: list[str] = []
    for index in range(min(page_count, settings.pdf_max_pages)):
        page = pdf[index]
        pages.append(page.render(scale=settings.pdf_render_scale).to_pil())
        page_texts.append(_pdf_page_text(page))
    if not pages:
        raise UnreadableInput('The PDF has no renderable pages.')

    transcript = None
    transcript_source = None
    ocr_unavailable = False
    if sum(len(text.strip()) for text in page_texts) > PDF_TEXT_MIN_CHARS_PER_PAGE * len(pages):
        transcript = '\f'.join(page_texts)
        transcript_source = 'pdf_text'
    else:
        # Scanned PDF — the text layer is useless; OCR the rendered pages.
        ocr_texts = [ocr.transcribe(page) or '' for page in pages]
        if any(ocr_texts):
            transcript = '\f'.join(ocr_texts)
            transcript_source = 'ocr'
        else:
            ocr_unavailable = True
    return DecodedInput(
        images_b64=[_encode_png(page) for page in pages],
        transcript=transcript,
        transcript_source=transcript_source,
        multi_page_truncated=truncated,
        ocr_unavailable=ocr_unavailable,
    )


def decode_to_images(content: bytes, content_type: str) -> DecodedInput:
    """Decode an upload into a DecodedInput. Raises on unsupported/unreadable input."""
    content_type = (content_type or '').lower()
    if content_type not in SUPPORTED_TYPES:
        raise UnsupportedMediaType(f'Unsupported content type: {content_type or "unknown"}')

    if content_type in PDF_TYPES:
        return _render_pdf(content)

    try:
        image = Image.open(io.BytesIO(content))
        image.load()
    except Exception as exc:  # noqa: BLE001 - Pillow raises varied errors
        raise UnreadableInput('The image could not be decoded.') from exc

    # OCR sees the full image (one pass, no seam duplicates); the model gets tiles.
    transcript = ocr.transcribe(image)
    return DecodedInput(
        images_b64=[_encode_png(tile) for tile in _tile_tall_image(image)],
        transcript=transcript,
        transcript_source='ocr' if transcript else None,
        ocr_unavailable=transcript is None,
    )
