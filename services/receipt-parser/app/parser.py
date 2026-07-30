"""Orchestration: images → model → normalized ParseResult with derived warnings.

The model's JSON is treated as untrusted: every field is coerced defensively and
arithmetic-consistency warnings are derived here (not trusted from the model) so
the contract holds regardless of model quality.
"""

from __future__ import annotations

import json
import re
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from app import llm
from app.errors import UnreadableInput
from app.images import DecodedInput
from app.schemas import Confidence, Item, ParseResult

_CENTS = Decimal('0.01')

# Money-shaped tokens in a machine transcript: `87.43`, `87,43`, `1,234.56`,
# `1.234,56`, `1 234,56`, `1234.56` — always exactly two decimal digits.
_MONEY_TOKEN_RE = re.compile(r'(?<![\d.,])(?:\d{1,3}(?:[ .,\u00a0]\d{3})+|\d+)[.,]\d{2}(?!\d)')

# Grounding thresholds: a value found verbatim in the transcript is near-certain
# (floor), one absent from it is suspect (cap + warning for the total).
_GROUNDED_FLOOR = 0.9
_UNGROUNDED_CAP = 0.5
_ITEMS_FLOOR_RATIO = 0.8
_ITEMS_CAP_RATIO = 0.5


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


def _transcript_money_tokens(transcript: str) -> set[str]:
    """Canonical 2-decimal strings for every money-shaped token in the transcript."""
    tokens: set[str] = set()
    for match in _MONEY_TOKEN_RE.finditer(transcript):
        raw = match.group()
        integer_digits = re.sub(r'\D', '', raw[:-3])
        tokens.add(str(Decimal(f'{integer_digits}.{raw[-2:]}')))
    return tokens


def _apply_grounding(
    transcript: str, total: str | None, items: list[Item], confidence: Confidence, warnings: set[str]
) -> None:
    """Cross-check model numbers against the transcript; adjust confidence deterministically.

    The transcript is machine-extracted, so its digits are trustworthy: a total found
    verbatim is near-certain, a total absent from it is suspect. Same idea for the
    fraction of item line_totals found.
    """
    tokens = _transcript_money_tokens(transcript)
    if total is not None:
        if total in tokens:
            confidence.total = max(confidence.total, _GROUNDED_FLOOR)
        else:
            warnings.add('total_not_in_source')
            confidence.total = min(confidence.total, _UNGROUNDED_CAP)

    line_totals = [item.line_total for item in items if item.line_total is not None]
    if line_totals:
        ratio = sum(1 for value in line_totals if value in tokens) / len(line_totals)
        if ratio >= _ITEMS_FLOOR_RATIO:
            confidence.items = max(confidence.items, _GROUNDED_FLOOR)
        elif ratio < _ITEMS_CAP_RATIO:
            confidence.items = min(confidence.items, _UNGROUNDED_CAP)


def _build_item(raw_item) -> Item | None:
    """One contract Item from one untrusted model row, or None for junk rows."""
    if not isinstance(raw_item, dict) or not raw_item.get('name'):
        return None
    return Item(
        name=str(raw_item['name']).strip(),
        quantity=_to_quantity_string(raw_item.get('quantity')),
        unit_price=_to_decimal_string(raw_item.get('unit_price')),
        line_total=_to_decimal_string(raw_item.get('line_total')),
        confidence=_clamp_confidence(raw_item.get('confidence')),
    )


def _item_math_mismatch(item: Item) -> bool:
    """Whether quantity × unit_price disagrees with the printed line_total by > 1 cent."""
    if item.unit_price is None or item.line_total is None:
        return False
    expected = (Decimal(item.quantity) * Decimal(item.unit_price)).quantize(_CENTS, rounding=ROUND_HALF_UP)
    return abs(expected - Decimal(item.line_total)) > _CENTS


def _sum_line_totals(items: list[Item]) -> Decimal:
    total = Decimal('0')
    for item in items:
        if item.line_total is not None:
            total += Decimal(item.line_total)
        elif item.unit_price is not None:
            total += Decimal(item.quantity) * Decimal(item.unit_price)
    return total.quantize(_CENTS, rounding=ROUND_HALF_UP)


def normalize(raw_text: str, decoded: DecodedInput) -> ParseResult:
    """Coerce raw model text into a contract-valid ParseResult with derived warnings."""
    data = _extract_json(raw_text)

    if isinstance(data.get('error'), str):
        raise UnreadableInput('The model reported the receipt as unreadable.')

    warnings: set[str] = set(w for w in data.get('warnings', []) if isinstance(w, str))

    items: list[Item] = []
    for raw_item in data.get('items', []) or []:
        item = _build_item(raw_item)
        if item is None:
            continue
        items.append(item)
        if _item_math_mismatch(item):
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
    if decoded.multi_page_truncated:
        warnings.add('multi_page_merged')
    if decoded.ocr_unavailable:
        warnings.add('ocr_unavailable')
    if decoded.transcript:
        _apply_grounding(decoded.transcript, total, items, confidence, warnings)

    return ParseResult(
        merchant=(str(data['merchant']).strip() if data.get('merchant') else None),
        date=(str(data['date']).strip() if data.get('date') else None),
        currency=currency,
        total=total,
        items=items,
        confidence=confidence,
        warnings=sorted(warnings),
    )


async def parse(decoded: DecodedInput) -> ParseResult:
    raw_text = await llm.extract(decoded.images_b64, decoded.transcript)
    return normalize(raw_text, decoded)
