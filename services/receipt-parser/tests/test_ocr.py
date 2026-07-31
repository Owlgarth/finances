"""Tests for app/ocr.py with the RapidOCR engine mocked — the line-grouping
geometry and the never-raises guarantee are ours; the engine is not."""

from unittest import mock

from PIL import Image

from app import ocr
from app.config import settings


def _box(x: float, y: float, width: float = 40, height: float = 10) -> list[list[float]]:
    return [[x, y], [x + width, y], [x + width, y + height], [x, y + height]]


def _image() -> Image.Image:
    return Image.new('RGB', (8, 8), color=(255, 255, 255))


class TestGroupLines:
    def test_row_structure_preserved(self):
        # A receipt row detected as two boxes (name left, price right) plus a
        # second row below — grouped by y, each line ordered by x.
        results = [
            [_box(150, 10), '3.99', 0.99],
            [_box(10, 11), 'Mleko UHT', 0.98],
            [_box(10, 30), 'Chleb', 0.97],
            [_box(150, 29), '4.49', 0.99],
        ]
        assert ocr._group_lines(results) == 'Mleko UHT 3.99\nChleb 4.49'

    def test_overlapping_y_merges_ragged_columns(self):
        # y-centers differ by a few px (skewed photo) but well within word height.
        results = [
            [_box(10, 10, height=12), 'Masło', 0.9],
            [_box(80, 14, height=12), 'ekstra', 0.9],
            [_box(150, 12, height=12), '7.99', 0.9],
        ]
        assert ocr._group_lines(results) == 'Masło ekstra 7.99'

    def test_distant_rows_stay_separate(self):
        results = [
            [_box(10, 10), 'SUMA', 0.9],
            [_box(10, 60), 'PLN', 0.9],
        ]
        assert ocr._group_lines(results) == 'SUMA\nPLN'

    def test_empty_texts_dropped(self):
        results = [[_box(10, 10), '  ', 0.5], [_box(10, 30), 'Real', 0.9]]
        assert ocr._group_lines(results) == 'Real'


class TestTranscribe:
    def test_disabled_returns_none_without_engine(self):
        with (
            mock.patch.object(settings, 'ocr_enabled', False),
            mock.patch.object(ocr, '_engine') as engine,
        ):
            assert ocr.transcribe(_image()) is None
        engine.assert_not_called()

    def test_engine_failure_returns_none(self):
        with mock.patch.object(ocr, '_engine', side_effect=RuntimeError('onnx exploded')):
            assert ocr.transcribe(_image()) is None

    def test_engine_no_detections_returns_none(self):
        engine = mock.Mock(return_value=(None, None))
        with mock.patch.object(ocr, '_engine', return_value=engine):
            assert ocr.transcribe(_image()) is None

    def test_engine_results_are_grouped(self):
        engine = mock.Mock(return_value=([[_box(10, 10), 'SUMA', 0.9], [_box(60, 10), '12.47', 0.9]], [0.1]))
        with mock.patch.object(ocr, '_engine', return_value=engine):
            assert ocr.transcribe(_image()) == 'SUMA 12.47'
