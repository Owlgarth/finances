import base64
import io
from unittest import mock

import pytest
from PIL import Image

from app import ocr
from app.config import settings


@pytest.fixture(autouse=True)
def _default_provider():
    """A local .env (real deployment config, e.g. PARSER_MODEL_PROVIDER=gemini)
    must not leak into the suite: tests assume the openai default and select
    the gemini path explicitly where they mean to."""
    with mock.patch.object(settings, 'model_provider', 'openai'):
        yield


@pytest.fixture(autouse=True)
def _no_real_ocr():
    """Tests stay offline/deterministic: the real ONNX engine is never initialized.

    transcribe() swallows the error and returns None; tests that need OCR output
    patch ocr.transcribe (orchestration) or ocr._engine (test_ocr) themselves.
    """
    with mock.patch.object(ocr, '_engine', side_effect=RuntimeError('real OCR disabled in tests')):
        yield


def make_text_pdf(pages: list[list[str]]) -> bytes:
    """Build a minimal born-digital PDF: one text object per page, real xref.

    Kept dependency-free so tests can produce PDFs with a genuine text layer
    (pypdfium2 can create pages but not easily insert text).
    """
    objects: list[bytes] = []  # 1-indexed; object number = position + 1
    objects.append(b'')  # placeholder for the catalog (needs the pages obj number)
    pages_obj_num = 2
    objects.append(b'')  # placeholder for the pages dict (needs kid numbers)

    font_obj_num = 2 + 2 * len(pages) + 1
    page_obj_nums: list[int] = []
    for lines in pages:
        stream = b'BT /F1 10 Tf 20 780 Td 12 TL\n'
        for line in lines:
            escaped = line.replace('\\', r'\\').replace('(', r'\(').replace(')', r'\)')
            stream += b'(' + escaped.encode('latin-1') + b') Tj T*\n'
        stream += b'ET'
        page_obj_nums.append(len(objects) + 1)
        objects.append(
            b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] '
            b'/Contents ' + str(len(objects) + 2).encode() + b' 0 R '
            b'/Resources << /Font << /F1 ' + str(font_obj_num).encode() + b' 0 R >> >> >>'
        )
        objects.append(b'<< /Length ' + str(len(stream)).encode() + b' >>\nstream\n' + stream + b'\nendstream')
    objects.append(b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')

    objects[0] = b'<< /Type /Catalog /Pages 2 0 R >>'
    kids = b' '.join(b'%d 0 R' % num for num in page_obj_nums)
    objects[1] = b'<< /Type /Pages /Kids [' + kids + b'] /Count ' + str(len(pages)).encode() + b' >>'
    assert pages_obj_num == 2 and font_obj_num == len(objects)

    out = io.BytesIO()
    out.write(b'%PDF-1.4\n')
    offsets: list[int] = []
    for number, obj in enumerate(objects, start=1):
        offsets.append(out.tell())
        out.write(b'%d 0 obj\n' % number + obj + b'\nendobj\n')
    xref_pos = out.tell()
    out.write(b'xref\n0 %d\n0000000000 65535 f \n' % (len(objects) + 1))
    for offset in offsets:
        out.write(b'%010d 00000 n \n' % offset)
    out.write(b'trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF' % (len(objects) + 1, xref_pos))
    return out.getvalue()


@pytest.fixture
def png_bytes() -> bytes:
    """A tiny valid PNG so decode_to_images succeeds without a real receipt."""
    image = Image.new('RGB', (4, 4), color=(255, 255, 255))
    buffer = io.BytesIO()
    image.save(buffer, format='PNG')
    return buffer.getvalue()


@pytest.fixture
def png_b64(png_bytes) -> str:
    return base64.b64encode(png_bytes).decode('ascii')
