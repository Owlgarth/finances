"""Google Gemini API backend for vision extraction (PARSER_MODEL_PROVIDER=gemini).

Talks to the Gemini REST API directly over httpx — no SDK dependency — and
mirrors llm.py's OpenAI-compatible flow: same system prompt, same image/
transcript ordering, same "raw model text out" return that parser.normalize
re-validates. Constrained decoding uses Gemini's response_schema (an OpenAPI
subset), derived from the contract-shaped RESPONSE_SCHEMA in llm.py so there is
a single source of truth for the output shape.
"""

from __future__ import annotations

import logging

import httpx

from app import llm
from app.config import settings
from app.errors import ModelUnavailable

logger = logging.getLogger(__name__)


def _to_gemini_schema(schema: dict) -> dict:
    """Convert a JSON-schema dict to Gemini's OpenAPI-subset Schema.

    Gemini has no union types: ``{'type': ['string', 'null']}`` becomes
    ``{'type': 'STRING', 'nullable': True}``, and type names are enum-style
    uppercase. Only the keys our contract schema uses are mapped; no top-level
    `required` is introduced so the {"error": "unreadable"} reply stays
    expressible (see the matching note on RESPONSE_SCHEMA).
    """
    converted: dict = {}
    schema_type = schema.get('type')
    if isinstance(schema_type, list):
        non_null = [t for t in schema_type if t != 'null']
        converted['type'] = non_null[0].upper()
        if 'null' in schema_type:
            converted['nullable'] = True
    elif schema_type:
        converted['type'] = schema_type.upper()
    if 'properties' in schema:
        converted['properties'] = {name: _to_gemini_schema(sub) for name, sub in schema['properties'].items()}
    if 'items' in schema:
        converted['items'] = _to_gemini_schema(schema['items'])
    if 'required' in schema:
        converted['required'] = list(schema['required'])
    return converted


GEMINI_RESPONSE_SCHEMA = _to_gemini_schema(llm.RESPONSE_SCHEMA)

# Set once when the API rejects response_schema (400) so every later request in
# this process goes straight to plain JSON output.
_schema_rejected = False


def _build_payload(images_b64: list[str], transcript: str | None, with_schema: bool) -> dict:
    parts: list[dict] = [{'text': 'Extract this receipt.'}]
    for image in images_b64:
        parts.append({'inline_data': {'mime_type': 'image/png', 'data': image}})
    if transcript:
        snippet = transcript[: settings.transcript_max_chars]
        parts.append({'text': llm.TRANSCRIPT_PREAMBLE + snippet})

    generation_config: dict = {'temperature': 0, 'responseMimeType': 'application/json'}
    if with_schema:
        generation_config['responseSchema'] = GEMINI_RESPONSE_SCHEMA
    if settings.gemini_thinking_level:
        generation_config['thinkingConfig'] = {'thinkingLevel': settings.gemini_thinking_level.upper()}

    return {
        'systemInstruction': {'parts': [{'text': llm.SYSTEM_PROMPT}]},
        'contents': [{'role': 'user', 'parts': parts}],
        'generationConfig': generation_config,
    }


def _response_text(data: dict) -> str:
    candidates = data.get('candidates') or []
    if not candidates:
        # Typically a safety block; promptFeedback carries the reason.
        block = (data.get('promptFeedback') or {}).get('blockReason', 'no candidates')
        raise ModelUnavailable(f'The Gemini API returned no answer ({block}).')
    parts = (candidates[0].get('content') or {}).get('parts') or []
    text = ''.join(part.get('text', '') for part in parts)
    if not text:
        raise ModelUnavailable('The Gemini API returned an empty response.')
    return text


async def _complete(payload: dict) -> httpx.Response:
    url = f'{settings.gemini_base_url.rstrip("/")}/models/{settings.gemini_model}:generateContent'
    async with httpx.AsyncClient(timeout=settings.model_timeout_seconds) as client:
        return await client.post(url, json=payload, headers={'x-goog-api-key': settings.gemini_api_key})


async def extract(images_b64: list[str], transcript: str | None = None) -> str:
    """Send images (plus an optional machine transcript) to Gemini and return the raw text response."""
    global _schema_rejected
    if not settings.gemini_api_key:
        raise ModelUnavailable('PARSER_GEMINI_API_KEY is not set.')

    try:
        response = await _complete(_build_payload(images_b64, transcript, with_schema=not _schema_rejected))
        if response.status_code == 400 and not _schema_rejected:
            _schema_rejected = True
            logger.warning(
                'Gemini rejected the request with response_schema (HTTP 400); '
                'falling back to plain JSON output for the rest of this process.'
            )
            response = await _complete(_build_payload(images_b64, transcript, with_schema=False))
        response.raise_for_status()
        return _response_text(response.json())
    except (httpx.HTTPError, ValueError) as exc:
        raise ModelUnavailable('The extraction model is unavailable or returned an unexpected response.') from exc


async def ping() -> None:
    """Lightweight reachability check for /health. Raises ModelUnavailable on failure."""
    if not settings.gemini_api_key:
        raise ModelUnavailable('PARSER_GEMINI_API_KEY is not set.')
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(
                f'{settings.gemini_base_url.rstrip("/")}/models/{settings.gemini_model}',
                headers={'x-goog-api-key': settings.gemini_api_key},
            )
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise ModelUnavailable('The Gemini API endpoint is unreachable.') from exc
