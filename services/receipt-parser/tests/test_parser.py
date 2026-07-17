"""Unit tests for the normalize() step — the contract's guarantees hold
regardless of model quality, so these run against raw model text with no
network. See test_api.py for the HTTP surface."""

import json

import pytest

from app.errors import UnreadableInput
from app.images import DecodedInput
from app.parser import normalize


def _decoded(**overrides) -> DecodedInput:
    return DecodedInput(images_b64=['img-b64'], **overrides)


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
    result = normalize(_model_json(), _decoded())
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
        _decoded(),
    )
    assert result.total == '20.50'
    assert result.items[0].unit_price == '3.00'
    assert result.items[0].line_total == '3.00'


def test_comma_decimals_coerced():
    result = normalize(_model_json(total='12,99', items=[]), _decoded())
    assert result.total == '12.99'


def test_total_mismatch_warning():
    result = normalize(_model_json(total='99.99'), _decoded())
    assert 'total_mismatch' in result.warnings


def test_total_missing_warning():
    result = normalize(_model_json(total=None), _decoded())
    assert result.total is None
    assert 'total_missing' in result.warnings


def test_item_math_mismatch_warning():
    result = normalize(
        _model_json(
            total='10.00',
            items=[{'name': 'Odd', 'quantity': '2', 'unit_price': '3.00', 'line_total': '10.00'}],
        ),
        _decoded(),
    )
    assert 'item_math_mismatch' in result.warnings


def test_multi_page_merged_warning():
    result = normalize(_model_json(), _decoded(multi_page_truncated=True))
    assert 'multi_page_merged' in result.warnings


def test_model_reported_unreadable_raises():
    with pytest.raises(UnreadableInput):
        normalize(json.dumps({'error': 'unreadable'}), _decoded())


def test_malformed_json_raises():
    with pytest.raises(UnreadableInput):
        normalize('the receipt says hello', _decoded())


def test_json_with_surrounding_prose_is_extracted():
    text = 'Here is your data:\n```json\n' + _model_json(items=[]) + '\n```\nHope that helps!'
    result = normalize(text, _decoded())
    assert result.merchant == 'Lidl'


def test_confidence_clamped_and_items_skip_nameless():
    result = normalize(
        _model_json(
            confidence={'merchant': 5, 'date': -1, 'currency': 'x', 'total': 0.5, 'items': 0.5},
            items=[{'name': '', 'line_total': '1.00'}, {'name': 'Real', 'line_total': '1.00'}],
        ),
        _decoded(),
    )
    assert result.confidence.merchant == 1.0
    assert result.confidence.date == 0.0
    assert result.confidence.currency == 0.0
    assert [i.name for i in result.items] == ['Real']


class TestTranscriptGrounding:
    TRANSCRIPT = 'Lidl sp. z o.o.\nBread 1 x 4.49 4.49\nButter 2 x 7.99 15.98\nSUMA PLN 20.47\n'

    def test_total_in_transcript_floors_confidence(self):
        raw = _model_json(confidence={'merchant': 0.9, 'date': 0.9, 'currency': 0.9, 'total': 0.6, 'items': 0.6})
        result = normalize(raw, _decoded(transcript=self.TRANSCRIPT, transcript_source='pdf_text'))
        assert result.confidence.total == 0.9
        assert 'total_not_in_source' not in result.warnings

    def test_floor_never_lowers_higher_confidence(self):
        result = normalize(_model_json(), _decoded(transcript=self.TRANSCRIPT))
        assert result.confidence.total == 0.98  # model said 0.98; floor is 0.9

    def test_total_absent_from_transcript_warns_and_caps(self):
        result = normalize(_model_json(total='21.47'), _decoded(transcript=self.TRANSCRIPT))
        assert 'total_not_in_source' in result.warnings
        assert result.confidence.total == 0.5

    def test_comma_decimal_transcript_matches_dot_total(self):
        transcript = 'Bread 4,49\nButter 15,98\nSUMA 20,47 PLN\n' + 'x' * 60
        result = normalize(_model_json(), _decoded(transcript=transcript))
        assert 'total_not_in_source' not in result.warnings
        assert result.confidence.total >= 0.9

    def test_thousands_separators_normalized(self):
        for printed in ('1,234.56', '1.234,56', '1 234,56'):
            transcript = f'INVOICE TOTAL {printed} due immediately'
            result = normalize(_model_json(total='1234.56', items=[]), _decoded(transcript=transcript))
            assert 'total_not_in_source' not in result.warnings, printed

    def test_all_item_totals_found_floors_items_confidence(self):
        raw = _model_json(confidence={'merchant': 0.9, 'date': 0.9, 'currency': 0.9, 'total': 0.9, 'items': 0.4})
        result = normalize(raw, _decoded(transcript=self.TRANSCRIPT))
        assert result.confidence.items == 0.9

    def test_most_item_totals_missing_caps_items_confidence(self):
        transcript = 'SUMA PLN 20.47\n' + 'unrelated text ' * 10
        result = normalize(_model_json(), _decoded(transcript=transcript))
        assert result.confidence.items == 0.5

    def test_items_without_line_totals_left_alone(self):
        raw = _model_json(items=[{'name': 'Bread', 'quantity': '1', 'confidence': 0.9}])
        result = normalize(raw, _decoded(transcript=self.TRANSCRIPT))
        assert result.confidence.items == 0.95  # untouched

    def test_no_transcript_skips_all_grounding(self):
        result = normalize(_model_json(total='21.47'), _decoded())
        assert 'total_not_in_source' not in result.warnings
        assert result.confidence.total == 0.98
