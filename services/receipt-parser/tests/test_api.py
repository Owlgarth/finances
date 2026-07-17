"""HTTP surface tests. The model call (app.llm.extract) is mocked so these run
offline and deterministically — provider swap is an env change, not a code change."""

import json
from unittest import mock

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app, raise_server_exceptions=False)

GOOD_MODEL_JSON = json.dumps(
    {
        'merchant': 'Biedronka',
        'date': '2026-06-28',
        'currency': 'PLN',
        'total': '7.98',
        'items': [{'name': 'Milk', 'quantity': '2', 'unit_price': '3.99', 'line_total': '7.98', 'confidence': 0.97}],
        'confidence': {'merchant': 0.9, 'date': 0.95, 'currency': 0.99, 'total': 0.97, 'items': 0.95},
        'warnings': [],
    }
)


def test_root_reports_schema_version():
    response = client.get('/')
    assert response.status_code == 200
    assert response.json()['schema_version'] == '1'


def test_parse_happy_path(png_bytes):
    with mock.patch('app.parser.llm.extract', new=mock.AsyncMock(return_value=GOOD_MODEL_JSON)):
        response = client.post('/parse', files={'file': ('receipt.png', png_bytes, 'image/png')})
    assert response.status_code == 200
    body = response.json()
    assert body['schema_version'] == '1'
    assert body['merchant'] == 'Biedronka'
    assert body['total'] == '7.98'
    assert body['items'][0]['name'] == 'Milk'


def test_parse_unsupported_media_type(png_bytes):
    response = client.post('/parse', files={'file': ('malware.exe', b'MZ', 'application/octet-stream')})
    assert response.status_code == 400
    body = response.json()
    assert body['error']['code'] == 'unsupported_media_type'
    assert body['schema_version'] == '1'


def test_parse_unreadable_image():
    # Valid content-type but undecodable bytes.
    response = client.post('/parse', files={'file': ('x.png', b'not-an-image', 'image/png')})
    assert response.status_code == 422
    assert response.json()['error']['code'] == 'unreadable_input'


def test_parse_model_unavailable(png_bytes):
    from app.errors import ModelUnavailable

    with mock.patch('app.parser.llm.extract', new=mock.AsyncMock(side_effect=ModelUnavailable('down'))):
        response = client.post('/parse', files={'file': ('r.png', png_bytes, 'image/png')})
    assert response.status_code == 503
    assert response.json()['error']['code'] == 'model_unavailable'


def test_parse_model_returns_unreadable(png_bytes):
    with mock.patch('app.parser.llm.extract', new=mock.AsyncMock(return_value='{"error": "unreadable"}')):
        response = client.post('/parse', files={'file': ('r.png', png_bytes, 'image/png')})
    assert response.status_code == 422
    assert response.json()['error']['code'] == 'unreadable_input'


def test_health_ok():
    with mock.patch('app.main.llm.ping', new=mock.AsyncMock(return_value=None)):
        response = client.get('/health')
    assert response.status_code == 200
    assert response.json()['status'] == 'ok'


def test_health_model_down():
    from app.errors import ModelUnavailable

    with mock.patch('app.main.llm.ping', new=mock.AsyncMock(side_effect=ModelUnavailable('unreachable'))):
        response = client.get('/health')
    assert response.status_code == 503
    assert response.json()['error']['code'] == 'model_unavailable'


class TestAuth:
    def test_token_required_when_configured(self, png_bytes):
        from app.config import settings

        with mock.patch.object(settings, 'api_token', 'secret'):
            response = client.post('/parse', files={'file': ('r.png', png_bytes, 'image/png')})
        assert response.status_code == 401
        assert response.json()['error']['code'] == 'unauthorized'

    def test_valid_token_accepted(self, png_bytes):
        from app.config import settings

        with (
            mock.patch.object(settings, 'api_token', 'secret'),
            mock.patch('app.parser.llm.extract', new=mock.AsyncMock(return_value=GOOD_MODEL_JSON)),
        ):
            response = client.post(
                '/parse',
                files={'file': ('r.png', png_bytes, 'image/png')},
                headers={'Authorization': 'Bearer secret'},
            )
        assert response.status_code == 200


def test_parse_photo_with_ocr_down_warns_but_succeeds(png_bytes):
    # The autouse fixture breaks the OCR engine — extraction must still work,
    # vision-only, with the ocr_unavailable warning surfaced.
    with mock.patch('app.parser.llm.extract', new=mock.AsyncMock(return_value=GOOD_MODEL_JSON)):
        response = client.post('/parse', files={'file': ('receipt.png', png_bytes, 'image/png')})
    assert response.status_code == 200
    body = response.json()
    assert body['total'] == '7.98'
    assert 'ocr_unavailable' in body['warnings']
