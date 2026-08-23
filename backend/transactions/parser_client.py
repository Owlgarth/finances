"""Thin client for the optional receipt parser service (see docs/parser-contract.md).

Everything here is gated on settings.EXTRACTION_ENABLED. The parser runs on a
host that is only intermittently available, so failures are split in two:
ParserUnavailableError means "try again later" (the Celery task retries with
backoff), plain ParserServiceError means the receipt itself was rejected and
retrying cannot help.
"""

from __future__ import annotations

import requests
from django.conf import settings
from django.core.cache import cache

REACHABLE_CACHE_KEY = 'parser:reachable'


class ParserServiceError(Exception):
    """The parser rejected the request. Permanent — retrying sends the same bytes."""


class ParserUnavailableError(ParserServiceError):
    """The parser (or the model behind it) is temporarily down. Retryable."""


def is_enabled() -> bool:
    return bool(getattr(settings, 'EXTRACTION_ENABLED', False))


def _headers() -> dict:
    if settings.PARSER_API_TOKEN:
        return {'Authorization': f'Bearer {settings.PARSER_API_TOKEN}'}
    return {}


def is_reachable() -> bool:
    """Whether the parser answers right now, cached for PARSER_HEALTH_CACHE_SECONDS.

    The parser's /health also probes the model endpoint, so this is false both
    when the host is off and when the LLM behind it is down — either way
    extraction cannot run and the UI should say so.
    """
    if not is_enabled():
        return False

    cached = cache.get(REACHABLE_CACHE_KEY)
    if cached is not None:
        return cached

    try:
        response = requests.get(
            f'{settings.PARSER_URL}/health',
            headers=_headers(),
            timeout=settings.PARSER_HEALTH_TIMEOUT_SECONDS,
        )
        reachable = response.status_code == 200
    except requests.RequestException:
        reachable = False

    cache.set(REACHABLE_CACHE_KEY, reachable, settings.PARSER_HEALTH_CACHE_SECONDS)
    return reachable


def parse_receipt(content: bytes, filename: str, content_type: str) -> dict:
    """POST the file to the parser and return its contract JSON.

    Raises ParserUnavailableError when the service or its model is down, and
    ParserServiceError when the file itself was rejected.
    """
    if not is_enabled():
        raise ParserServiceError('Receipt extraction is not configured.')

    try:
        response = requests.post(
            f'{settings.PARSER_URL}/parse',
            files={'file': (filename, content, content_type)},
            headers=_headers(),
            timeout=settings.PARSER_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        # Connection refused / DNS / timeout — the host is very likely powered off.
        raise ParserUnavailableError(f'Parser service unreachable: {exc}') from exc

    if response.status_code != 200:
        # The parser returns a structured error body per its contract.
        try:
            detail = response.json().get('error', {}).get('message', response.text)
        except ValueError:
            detail = response.text
        message = f'Parser returned {response.status_code}: {detail}'
        # 5xx (incl. the parser's own 503 model_unavailable) is transient; a 4xx
        # means this file will be rejected identically every time.
        if response.status_code >= 500:
            raise ParserUnavailableError(message)
        raise ParserServiceError(message)

    try:
        return response.json()
    except ValueError as exc:
        raise ParserServiceError('Parser returned a non-JSON response.') from exc
