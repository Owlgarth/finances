"""Orchestration: images → model → normalized ParseResult with derived warnings.

The model's JSON is treated as untrusted: every field is coerced defensively and
arithmetic-consistency warnings are derived here (not trusted from the model) so
the contract holds regardless of model quality.
"""

from __future__ import annotations

import json
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from app import llm
from app.errors import UnreadableInput
from app.schemas import Confidence, Item, ParseResult

_CENTS = Decimal('0.01')


def _to_decimal_string(value) -> str | None:
    if value is None:
        return None
    try:
        dec = Decimal(str(value).replace(',', '.').strip())
    except (InvalidOperation, ValueError):
        return None
    return str(dec.quantize(_CENTS, rounding=ROUND_HALF_UP))


def _to_quantity_string(value) -> str:
    if value is None:
        return '1'
    try:
        dec = Decimal(str(value).replace(',', '.').strip())
    except (InvalidOperation, ValueError):
        return '1'
    return str(dec.normalize()) if dec != 0 else '1'


def _clamp_confidence(value) -> float:
    try:
        return max(0.0, min(1.0, float(value)))
    except (TypeError, ValueError):
        return 0.0


def _extract_json(text: str) -> dict:
    """Pull the first JSON object out of the model text (tolerates stray prose/fences)."""
    text = text.strip()
    start = text.find('{')
    end = text.rfind('}')
    if start == -1 or end == -1 or end < start:
        raise UnreadableInput('The model did not return usable JSON.')
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError as exc:
        raise UnreadableInput('The model returned malformed JSON.') from exc


def _sum_line_totals(items: list[Item]) -> Decimal:
    total = Decimal('0')
    for item in items:
        if item.line_total is not None:
            total += Decimal(item.line_total)
        elif item.unit_price is not None:
            total += Decimal(item.quantity) * Decimal(item.unit_price)
    return total.quantize(_CENTS, rounding=ROUND_HALF_UP)


def normalize(raw_text: str, multi_page_truncated: bool) -> ParseResult:
    """Coerce raw model text into a contract-valid ParseResult with derived warnings."""
    data = _extract_json(raw_text)

    if isinstance(data.get('error'), str):
        raise UnreadableInput('The model reported the receipt as unreadable.')

    warnings: set[str] = set(w for w in data.get('warnings', []) if isinstance(w, str))

    items: list[Item] = []
    for raw_item in data.get('items', []) or []:
        if not isinstance(raw_item, dict) or not raw_item.get('name'):
            continue
        item = Item(
            name=str(raw_item['name']).strip(),
            quantity=_to_quantity_string(raw_item.get('quantity')),
            unit_price=_to_decimal_string(raw_item.get('unit_price')),
            line_total=_to_decimal_string(raw_item.get('line_total')),
            confidence=_clamp_confidence(raw_item.get('confidence')),
        )
        items.append(item)
        # Derived per-row math check.
        if item.unit_price is not None and item.line_total is not None:
            expected = (Decimal(item.quantity) * Decimal(item.unit_price)).quantize(_CENTS, rounding=ROUND_HALF_UP)
            if abs(expected - Decimal(item.line_total)) > _CENTS:
                warnings.add('item_math_mismatch')

    total = _to_decimal_string(data.get('total'))
    currency = data.get('currency')
    currency = str(currency).upper() if currency else None

    raw_conf = data.get('confidence', {}) or {}
    confidence = Confidence(
        merchant=_clamp_confidence(raw_conf.get('merchant')),
        date=_clamp_confidence(raw_conf.get('date')),
        currency=_clamp_confidence(raw_conf.get('currency')),
        total=_clamp_confidence(raw_conf.get('total')),
        items=_clamp_confidence(raw_conf.get('items')),
    )

    # Derived document-level warnings.
    if total is None:
        warnings.add('total_missing')
    elif items:
        if abs(_sum_line_totals(items) - Decimal(total)) > _CENTS:
            warnings.add('total_mismatch')
    if multi_page_truncated:
        warnings.add('multi_page_merged')

    return ParseResult(
        merchant=(str(data['merchant']).strip() if data.get('merchant') else None),
        date=(str(data['date']).strip() if data.get('date') else None),
        currency=currency,
        total=total,
        items=items,
        confidence=confidence,
        warnings=sorted(warnings),
    )


async def parse(images_b64: list[str], multi_page_truncated: bool) -> ParseResult:
    raw_text = await llm.extract(images_b64)
    return normalize(raw_text, multi_page_truncated)
