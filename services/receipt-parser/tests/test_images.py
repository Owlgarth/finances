"""Tests for decode_to_images — in particular the PDF text-layer fast path:
born-digital PDFs carry their transcript, scanned/empty ones don't."""

import io

import pypdfium2 as pdfium

from app.images import decode_to_images
from tests.conftest import make_text_pdf

RECEIPT_LINES = [
    'Biedronka 4381 Warszawa ul. Prosta 1',
    'Mleko UHT 3.2% 1L        2 x 3.99   7.98',
    'Chleb wiejski 500g       1 x 4.49   4.49',
    'SUMA PLN 12.47',
    'NIP 779-10-11-327  2026-06-28 14:31',
]


def _blank_pdf() -> bytes:
    """A rendered page with no text layer — stands in for a scanned PDF."""
    pdf = pdfium.PdfDocument.new()
    pdf.new_page(200, 200)
    buffer = io.BytesIO()
    pdf.save(buffer)
    return buffer.getvalue()


def test_born_digital_pdf_yields_transcript():
    decoded = decode_to_images(make_text_pdf([RECEIPT_LINES]), 'application/pdf')
    assert len(decoded.images_b64) == 1
    assert decoded.transcript_source == 'pdf_text'
    assert 'SUMA PLN 12.47' in decoded.transcript
    assert 'Mleko UHT' in decoded.transcript


def test_multi_page_pdf_joins_pages_with_form_feed():
    decoded = decode_to_images(make_text_pdf([RECEIPT_LINES, RECEIPT_LINES]), 'application/pdf')
    assert len(decoded.images_b64) == 2
    assert decoded.transcript.count('\f') == 1
    assert decoded.multi_page_truncated is False


def test_scanned_pdf_has_no_transcript():
    decoded = decode_to_images(_blank_pdf(), 'application/pdf')
    assert len(decoded.images_b64) == 1
    assert decoded.transcript is None
    assert decoded.transcript_source is None


def test_sparse_text_pdf_fails_born_digital_heuristic():
    # A real text layer, but far below the chars/page threshold (e.g. a scan
    # with a tiny OCR'd header) — must not be trusted as a transcript.
    decoded = decode_to_images(make_text_pdf([['Lidl']]), 'application/pdf')
    assert decoded.transcript is None


def test_plain_image_has_no_transcript(png_bytes):
    decoded = decode_to_images(png_bytes, 'image/png')
    assert decoded.transcript is None
    assert decoded.transcript_source is None
