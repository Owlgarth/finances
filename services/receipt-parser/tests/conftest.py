import base64
import io

import pytest
from PIL import Image


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
