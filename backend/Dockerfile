FROM python:3.13-slim

# UV_PROJECT_ENVIRONMENT lives outside /app: the source is bind-mounted in dev,
# and a volume mounted inside it would create a root-owned .venv in the checkout.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_SYSTEM_PYTHON=1 \
    UV_PROJECT_ENVIRONMENT=/venv

# Public build metadata only: ARG values are recorded in image history and public
# CI logs, so only public values ever become ARGs - secrets arrive at runtime.
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}

RUN apt-get update && apt-get install -y \
    gcc \
    gettext \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.12.8 /uv /uvx /bin/

RUN groupadd -r appuser && useradd -r -g appuser -d /app -s /sbin/nologin appuser

WORKDIR /app

RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-install-project

COPY . /app

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

COPY celery-entrypoint.sh /app/celery-entrypoint.sh
RUN chmod +x /app/celery-entrypoint.sh

# Create static/media dirs and set ownership
RUN mkdir -p /app/staticfiles /app/mediafiles && \
    chown -R appuser:appuser /app /venv

USER appuser

EXPOSE 8000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["uv", "run", "uvicorn", "config.asgi:application", "--host", "0.0.0.0", "--port", "8000"]
