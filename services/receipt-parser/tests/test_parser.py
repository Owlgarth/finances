"""Unit tests for the normalize() step — the contract's guarantees hold
regardless of model quality, so these run against raw model text with no
network. See test_api.py for the HTTP surface."""

import json

import pytest

from app.errors import UnreadableInput
from app.parser import normalize


def _model_json(**overrides) -> str:
    payload = {
        'merchant': 'Lidl',
        'date': '2026-06-14',
        'currency': 'pln',
        'total': '20.47',
        'items': [
            {'name': 'Bread', 'quantity': '1', 'unit_price': '4.49', 'line_total': '4.49', 'confidence': 0.98},
            {'name': 'Butter', 'quantity': '2', 'unit_price': '7.99', 'line_total': '15.98', 'confidence': 0.96},
        ],
        'confidence': {'merchant': 0.9, 'date': 0.95, 'currency': 0.99, 'total': 0.98, 'items': 0.95},
        'warnings': [],
    }
    payload.update(overrides)
    return json.dumps(payload)


def test_typical_receipt_normalizes():
    result = normalize(_model_json(), multi_page_truncated=False)
    assert result.schema_version == '1'
    assert result.currency == 'PLN'  # uppercased
    assert result.total == '20.47'
    assert [i.name for i in result.items] == ['Bread', 'Butter']
    assert result.warnings == []


def test_money_values_are_decimal_strings():
    result = normalize(
        _model_json(
            total=20.5,
            items=[
                {'name': 'X', 'quantity': 1, 'unit_price': 3, 'line_total': 3},
            ],
        ),
        multi_page_truncated=False,
    )
    assert result.total == '20.50'
    assert result.items[0].unit_price == '3.00'
    assert result.items[0].line_total == '3.00'


def test_comma_decimals_coerced():
    result = normalize(_model_json(total='12,99', items=[]), multi_page_truncated=False)
    assert result.total == '12.99'


def test_total_mismatch_warning():
    result = normalize(_model_json(total='99.99'), multi_page_truncated=False)
    assert 'total_mismatch' in result.warnings


def test_total_missing_warning():
    result = normalize(_model_json(total=None), multi_page_truncated=False)
    assert result.total is None
    assert 'total_missing' in result.warnings


def test_item_math_mismatch_warning():
    result = normalize(
        _model_json(
            total='10.00',
            items=[{'name': 'Odd', 'quantity': '2', 'unit_price': '3.00', 'line_total': '10.00'}],
        ),
        multi_page_truncated=False,
    )
    assert 'item_math_mismatch' in result.warnings


def test_multi_page_merged_warning():
    result = normalize(_model_json(), multi_page_truncated=True)
    assert 'multi_page_merged' in result.warnings


def test_model_reported_unreadable_raises():
    with pytest.raises(UnreadableInput):
        normalize(json.dumps({'error': 'unreadable'}), multi_page_truncated=False)


def test_malformed_json_raises():
    with pytest.raises(UnreadableInput):
        normalize('the receipt says hello', multi_page_truncated=False)


def test_json_with_surrounding_prose_is_extracted():
    text = 'Here is your data:\n```json\n' + _model_json(items=[]) + '\n```\nHope that helps!'
    result = normalize(text, multi_page_truncated=False)
    assert result.merchant == 'Lidl'


def test_confidence_clamped_and_items_skip_nameless():
    result = normalize(
        _model_json(
            confidence={'merchant': 5, 'date': -1, 'currency': 'x', 'total': 0.5, 'items': 0.5},
            items=[{'name': '', 'line_total': '1.00'}, {'name': 'Real', 'line_total': '1.00'}],
        ),
        multi_page_truncated=False,
    )
    assert result.confidence.merchant == 1.0
    assert result.confidence.date == 0.0
    assert result.confidence.currency == 0.0
    assert [i.name for i in result.items] == ['Real']
