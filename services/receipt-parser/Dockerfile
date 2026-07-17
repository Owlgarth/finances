FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_SYSTEM_PYTHON=1

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

RUN groupadd -r appuser && useradd -r -g appuser -d /app -s /sbin/nologin appuser

WORKDIR /app

# Install dependencies first for layer caching. No lockfile is committed for this
# standalone service, so resolve from pyproject.toml.
COPY pyproject.toml /app/
# The overrides file mirrors [tool.uv] override-dependencies in pyproject.toml:
# GUI opencv-python is replaced by opencv-python-headless (no X11/GL in slim).
RUN --mount=type=cache,target=/root/.cache/uv \
    printf 'opencv-python; sys_platform == "never"\n' > /tmp/overrides.txt && \
    uv pip install --system --overrides /tmp/overrides.txt .

# One-shot OCR warmup: the ONNX models ship inside the rapidocr wheel (no runtime
# egress), so this only proves the engine initializes and runs in this image.
RUN python -c "\
from rapidocr_onnxruntime import RapidOCR; \
import numpy as np; \
RapidOCR()(np.zeros((32, 32, 3), dtype=np.uint8))"

COPY app /app/app

USER appuser

EXPOSE 8100

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8100"]
