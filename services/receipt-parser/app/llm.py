"""OpenAI-compatible chat-completions client for vision extraction.

Kept deliberately thin: it sends the prompt + images and returns the raw model
text. Prompt construction and JSON parsing live in parser.py so this module can
be swapped or mocked wholesale in tests.
"""

from __future__ import annotations

import httpx

from app.config import settings
from app.errors import ModelUnavailable

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


async def extract(images_b64: list[str]) -> str:
    """Send images to the model and return the raw text response."""
    content: list[dict] = [{'type': 'text', 'text': 'Extract this receipt.'}]
    for image in images_b64:
        content.append({'type': 'image_url', 'image_url': {'url': f'data:image/png;base64,{image}'}})

    payload = {
        'model': settings.model_name,
        'messages': [
            {'role': 'system', 'content': SYSTEM_PROMPT},
            {'role': 'user', 'content': content},
        ],
        'temperature': 0,
        'response_format': {'type': 'json_object'},
    }
    headers = {'Authorization': f'Bearer {settings.model_api_key}'}

    try:
        async with httpx.AsyncClient(timeout=settings.model_timeout_seconds) as client:
            response = await client.post(
                f'{settings.model_base_url.rstrip("/")}/chat/completions',
                json=payload,
                headers=headers,
            )
            response.raise_for_status()
            data = response.json()
        return data['choices'][0]['message']['content']
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
