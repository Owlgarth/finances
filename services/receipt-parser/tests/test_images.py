"""Tests for decode_to_images — the PDF text-layer fast path (born-digital PDFs
carry their transcript) and the OCR fallback for photos and scanned PDFs
(transcribe is mocked; the engine never runs here)."""

import base64
import io
from unittest import mock

import pypdfium2 as pdfium
from PIL import Image

from app import ocr
from app import images as images_module
from app.images import TILE_MAX_ASPECT, TILE_OVERLAP, decode_to_images
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
    with mock.patch.object(ocr, 'transcribe') as transcribe:
        decoded = decode_to_images(make_text_pdf([RECEIPT_LINES]), 'application/pdf')
    assert len(decoded.images_b64) == 1
    assert decoded.transcript_source == 'pdf_text'
    assert 'SUMA PLN 12.47' in decoded.transcript
    assert 'Mleko UHT' in decoded.transcript
    assert decoded.ocr_unavailable is False
    transcribe.assert_not_called()  # the text layer wins; OCR is not attempted


def test_multi_page_pdf_joins_pages_with_form_feed():
    decoded = decode_to_images(make_text_pdf([RECEIPT_LINES, RECEIPT_LINES]), 'application/pdf')
    assert len(decoded.images_b64) == 2
    assert decoded.transcript.count('\f') == 1
    assert decoded.multi_page_truncated is False


def test_scanned_pdf_falls_back_to_ocr():
    with mock.patch.object(ocr, 'transcribe', return_value='SUMA 12.47'):
        decoded = decode_to_images(_blank_pdf(), 'application/pdf')
    assert decoded.transcript == 'SUMA 12.47'
    assert decoded.transcript_source == 'ocr'
    assert decoded.ocr_unavailable is False


def test_scanned_pdf_with_failed_ocr_has_no_transcript():
    decoded = decode_to_images(_blank_pdf(), 'application/pdf')  # autouse fixture: OCR fails
    assert len(decoded.images_b64) == 1
    assert decoded.transcript is None
    assert decoded.transcript_source is None
    assert decoded.ocr_unavailable is True


def test_sparse_text_pdf_fails_born_digital_heuristic():
    # A real text layer, but far below the chars/page threshold (e.g. a scan
    # with a tiny OCR'd header) — must not be trusted as a transcript.
    decoded = decode_to_images(make_text_pdf([['Lidl']]), 'application/pdf')
    assert decoded.transcript is None
    assert decoded.ocr_unavailable is True  # OCR fallback was attempted and failed


def test_photo_gets_ocr_transcript(png_bytes):
    with mock.patch.object(ocr, 'transcribe', return_value='Mleko 3.99\nSUMA 3.99'):
        decoded = decode_to_images(png_bytes, 'image/png')
    assert decoded.transcript == 'Mleko 3.99\nSUMA 3.99'
    assert decoded.transcript_source == 'ocr'
    assert decoded.ocr_unavailable is False


def test_photo_with_unavailable_ocr_has_no_transcript(png_bytes):
    decoded = decode_to_images(png_bytes, 'image/png')  # autouse fixture: OCR fails
    assert decoded.transcript is None
    assert decoded.transcript_source is None
    assert decoded.ocr_unavailable is True


class TestTiling:
    def _decode_png_of(self, width: int, height: int):
        image = Image.new('RGB', (width, height), color=(255, 255, 255))
        buffer = io.BytesIO()
        image.save(buffer, format='PNG')
        return decode_to_images(buffer.getvalue(), 'image/png')

    def test_long_receipt_is_tiled_with_overlap(self):
        width, height = 900, 9000
        decoded = self._decode_png_of(width, height)
        tiles = [Image.open(io.BytesIO(base64.b64decode(tile))) for tile in decoded.images_b64]
        assert len(tiles) > 1
        tile_height = int(width * TILE_MAX_ASPECT)
        assert all(tile.size == (width, tile_height) for tile in tiles)
        # Consecutive tiles overlap by ~15% and the full height is covered.
        step = int(tile_height * (1 - TILE_OVERLAP))
        assert len(tiles) == len(range(0, height - tile_height, step)) + 1

    def test_short_image_is_not_tiled(self):
        decoded = self._decode_png_of(900, 1800)  # tall aspect but under min height
        assert len(decoded.images_b64) == 1

    def test_moderate_aspect_is_not_tiled(self):
        decoded = self._decode_png_of(1200, 2400)  # tall enough but aspect 2.0
        assert len(decoded.images_b64) == 1


class TestTileGeometry:
    def test_bottom_aligned_final_tile_covers_everything(self):
        image = Image.new('RGB', (100, 1000))
        with mock.patch.object(images_module, 'TILE_MIN_HEIGHT', 500):
            tiles = images_module._tile_tall_image(image)
        tile_height = int(100 * TILE_MAX_ASPECT)
        step = int(tile_height * (1 - TILE_OVERLAP))
        tops = list(range(0, 1000 - tile_height, step)) + [1000 - tile_height]
        assert len(tiles) == len(tops)
        assert all(tile.size == (100, tile_height) for tile in tiles)
        # Coverage: consecutive windows overlap (no gap) and the last touches the bottom.
        for previous, current in zip(tops, tops[1:]):
            assert current < previous + tile_height
        assert tops[-1] + tile_height == 1000
