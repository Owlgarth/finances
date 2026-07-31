"""Google Gemini API backend for vision extraction (PARSER_MODEL_PROVIDER=gemini).

Talks to the Gemini REST API directly over httpx — no SDK dependency — and
mirrors llm.py's OpenAI-compatible flow: same system prompt, same image/
transcript ordering, same "raw model text out" return that parser.normalize
re-validates.

Output uses JSON mode (responseMimeType) WITHOUT a responseSchema, on measured
evidence (gemini-3.1-flash-lite, 2026-07): constrained decoding forces keys in
schema order, which fights the prompt's shape — fields ended up dumped into the
warnings array — and adding propertyOrdering fixed correctness but triggered a
~18k-token whitespace runaway (~30x cost). Plain JSON mode extracted the same
document perfectly at ~640 output tokens with thinking intact. The prompt
defines the shape; normalize() re-validates every field regardless.
"""

from __future__ import annotations

import logging

import httpx

from app import llm
from app.config import settings
from app.errors import ModelUnavailable

logger = logging.getLogger(__name__)


def _build_payload(images_b64: list[str], transcript: str | None) -> dict:
    parts: list[dict] = [{'text': 'Extract this receipt.'}]
    for image in images_b64:
        parts.append({'inline_data': {'mime_type': 'image/png', 'data': image}})
    if transcript:
        snippet = transcript[: settings.transcript_max_chars]
        parts.append({'text': llm.TRANSCRIPT_PREAMBLE + snippet})

    generation_config: dict = {'temperature': 0, 'responseMimeType': 'application/json'}
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


async def extract(images_b64: list[str], transcript: str | None = None) -> str:
    """Send images (plus an optional machine transcript) to Gemini and return the raw text response."""
    if not settings.gemini_api_key:
        raise ModelUnavailable('PARSER_GEMINI_API_KEY is not set.')

    url = f'{settings.gemini_base_url.rstrip("/")}/models/{settings.gemini_model}:generateContent'
    try:
        async with httpx.AsyncClient(timeout=settings.model_timeout_seconds) as client:
            response = await client.post(
                url,
                json=_build_payload(images_b64, transcript),
                headers={'x-goog-api-key': settings.gemini_api_key},
            )
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
