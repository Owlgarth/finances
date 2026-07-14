"""Thin client for the optional receipt parser service (see services/receipt-parser).

Everything here is gated on settings.EXTRACTION_ENABLED. Network/HTTP failures
raise ParserServiceError so the Celery task can record a retryable failed state.
"""

from __future__ import annotations

import requests
from django.conf import settings


class ParserServiceError(Exception):
    """Raised when the parser service is unreachable or returns an error response."""


def is_enabled() -> bool:
    return bool(getattr(settings, 'EXTRACTION_ENABLED', False))


def parse_receipt(content: bytes, filename: str, content_type: str) -> dict:
    """POST the file to the parser and return its contract JSON. Raises ParserServiceError on failure."""
    if not is_enabled():
        raise ParserServiceError('Receipt extraction is not configured.')

    headers = {}
    if settings.PARSER_API_TOKEN:
        headers['Authorization'] = f'Bearer {settings.PARSER_API_TOKEN}'

    try:
        response = requests.post(
            f'{settings.PARSER_URL}/parse',
            files={'file': (filename, content, content_type)},
            headers=headers,
            timeout=settings.PARSER_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        raise ParserServiceError(f'Parser service unreachable: {exc}') from exc

    if response.status_code != 200:
        # The parser returns a structured error body per its contract.
        try:
            detail = response.json().get('error', {}).get('message', response.text)
        except ValueError:
            detail = response.text
        raise ParserServiceError(f'Parser returned {response.status_code}: {detail}')

    try:
        return response.json()
    except ValueError as exc:
        raise ParserServiceError('Parser returned a non-JSON response.') from exc
