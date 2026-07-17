"""OpenAI-compatible chat-completions client for vision extraction.

Kept deliberately thin: it sends the prompt + images and returns the raw model
text. Prompt construction and JSON parsing live in parser.py so this module can
be swapped or mocked wholesale in tests.
"""

from __future__ import annotations

import logging

import httpx

from app.config import settings
from app.errors import ModelUnavailable

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    'You are a receipt-extraction engine. You are given one or more images of a single '
    'purchase receipt (multiple images are pages of the same receipt). Extract structured '
    'data and reply with ONE JSON object only — no prose, no code fences.\n\n'
    'JSON shape:\n'
    '{"merchant": str|null, "date": "YYYY-MM-DD"|null, "currency": ISO4217|null, '
    '"total": decimal-string|null, '
    '"items": [{"name": str, "quantity": decimal-string, "unit_price": decimal-string|null, '
    '"line_total": decimal-string|null, "confidence": 0..1}], '
    '"confidence": {"merchant":0..1,"date":0..1,"currency":0..1,"total":0..1,"items":0..1}, '
    '"warnings": [str]}\n\n'
    'Rules: all money values are decimal STRINGS (e.g. "3.99"), never numbers. Use the '
    'purchase date, not the print date. Report values as printed; do not correct arithmetic. '
    'If you cannot read a receipt at all, reply {"error": "unreadable"}.'
)


# The contract shape (CONTRACT.md v1) as a JSON schema for constrained decoding.
# Deliberately permissive — no top-level `required`, no additionalProperties:false —
# so the {"error": "unreadable"} reply stays expressible and lax OpenAI-compatible
# servers (vLLM, llama.cpp, Ollama) accept it. normalize() re-validates everything.
_MONEY = {'type': ['string', 'null']}
_SCORE = {'type': 'number'}
RESPONSE_SCHEMA = {
    'type': 'object',
    'properties': {
        'merchant': {'type': ['string', 'null']},
        'date': {'type': ['string', 'null']},
        'currency': {'type': ['string', 'null']},
        'total': _MONEY,
        'items': {
            'type': 'array',
            'items': {
                'type': 'object',
                'properties': {
                    'name': {'type': 'string'},
                    'quantity': {'type': 'string'},
                    'unit_price': _MONEY,
                    'line_total': _MONEY,
                    'confidence': _SCORE,
                },
                'required': ['name'],
            },
        },
        'confidence': {
            'type': 'object',
            'properties': {field: _SCORE for field in ('merchant', 'date', 'currency', 'total', 'items')},
        },
        'warnings': {'type': 'array', 'items': {'type': 'string'}},
        'error': {'type': 'string'},
    },
}

# Set once when the endpoint rejects json_schema (4xx) so every later request in
# this process goes straight to json_object.
_schema_rejected = False

TRANSCRIPT_PREAMBLE = (
    'Below is a machine-extracted text transcript of the same receipt. Its digits and '
    'amounts are reliable, but its layout and word order may be imperfect. Prefer the '
    "transcript's digits whenever the image is ambiguous or hard to read.\n\n"
)


def _json_schema_format() -> dict:
    return {'type': 'json_schema', 'json_schema': {'name': 'receipt_extraction', 'schema': RESPONSE_SCHEMA}}


async def _complete(content: list[dict], response_format: dict) -> str:
    payload = {
        'model': settings.model_name,
        'messages': [
            {'role': 'system', 'content': SYSTEM_PROMPT},
            {'role': 'user', 'content': content},
        ],
        'temperature': 0,
        'response_format': response_format,
    }
    headers = {'Authorization': f'Bearer {settings.model_api_key}'}
    async with httpx.AsyncClient(timeout=settings.model_timeout_seconds) as client:
        response = await client.post(
            f'{settings.model_base_url.rstrip("/")}/chat/completions',
            json=payload,
            headers=headers,
        )
        response.raise_for_status()
        data = response.json()
    return data['choices'][0]['message']['content']


async def extract(images_b64: list[str], transcript: str | None = None) -> str:
    """Send images (plus an optional machine transcript) to the model and return the raw text response."""
    global _schema_rejected
    content: list[dict] = [{'type': 'text', 'text': 'Extract this receipt.'}]
    for image in images_b64:
        content.append({'type': 'image_url', 'image_url': {'url': f'data:image/png;base64,{image}'}})
    if transcript:
        snippet = transcript[: settings.transcript_max_chars]
        content.append({'type': 'text', 'text': TRANSCRIPT_PREAMBLE + snippet})

    try:
        if settings.structured_output == 'json_schema' and not _schema_rejected:
            try:
                return await _complete(content, _json_schema_format())
            except httpx.HTTPStatusError as exc:
                if not (400 <= exc.response.status_code < 500):
                    raise
                _schema_rejected = True
                logger.warning(
                    'Model endpoint rejected json_schema response_format (HTTP %s); '
                    'falling back to json_object for the rest of this process.',
                    exc.response.status_code,
                )
        return await _complete(content, {'type': 'json_object'})
    except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
        raise ModelUnavailable('The extraction model is unavailable or returned an unexpected response.') from exc


async def ping() -> None:
    """Lightweight reachability check for /health. Raises ModelUnavailable on failure."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(
                f'{settings.model_base_url.rstrip("/")}/models',
                headers={'Authorization': f'Bearer {settings.model_api_key}'},
            )
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise ModelUnavailable('The extraction model endpoint is unreachable.') from exc
