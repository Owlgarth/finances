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
    images: list[str] = []
    for index in range(min(page_count, settings.pdf_max_pages)):
        bitmap = pdf[index].render(scale=settings.pdf_render_scale)
        images.append(_encode_png(bitmap.to_pil()))
    if not images:
        raise UnreadableInput('The PDF has no renderable pages.')
    return DecodedInput(images_b64=images, multi_page_truncated=truncated)


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
    return DecodedInput(images_b64=[_encode_png(image)])
