"""Gemini backend tests — request payload shape, response parsing, and provider
dispatch. The HTTP client is faked so nothing leaves the process.

Note there is deliberately NO responseSchema in the payload — see the module
docstring in app/gemini.py for the measured pathology behind that choice."""

from unittest import mock

import httpx
import pytest

from app import gemini, llm
from app.config import settings
from app.errors import ModelUnavailable

RAW_JSON = '{"total": null}'


@pytest.fixture(autouse=True)
def _gemini_settings():
    with (
        mock.patch.object(settings, 'gemini_api_key', 'test-key'),
        mock.patch.object(settings, 'gemini_thinking_level', 'low'),
    ):
        yield


class _FakeResponse:
    def __init__(self, status_code: int = 200, body: dict | None = None):
        self.status_code = status_code
        self._body = body if body is not None else {'candidates': [{'content': {'parts': [{'text': RAW_JSON}]}}]}

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            request = httpx.Request('POST', 'http://fake/generateContent')
            response = httpx.Response(self.status_code, request=request)
            raise httpx.HTTPStatusError(f'HTTP {self.status_code}', request=request, response=response)

    def json(self) -> dict:
        return self._body


class _FakeClient:
    """Records every request payload; answers with queued responses (then 200s)."""

    def __init__(self, requests: list, responses: list[_FakeResponse], **_kwargs):
        self._requests = requests
        self._responses = responses

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc) -> bool:
        return False

    async def post(self, url, json=None, headers=None) -> _FakeResponse:
        self._requests.append({'url': url, 'json': json, 'headers': headers})
        return self._responses.pop(0) if self._responses else _FakeResponse()

    async def get(self, url, headers=None) -> _FakeResponse:
        self._requests.append({'url': url, 'headers': headers})
        return self._responses.pop(0) if self._responses else _FakeResponse()


def _fake_http(responses: list[_FakeResponse] | None = None) -> tuple[list, mock._patch]:
    requests: list = []
    remaining = list(responses or [])  # shared across client instantiations
    patcher = mock.patch.object(
        gemini.httpx, 'AsyncClient', lambda **kwargs: _FakeClient(requests, remaining, **kwargs)
    )
    return requests, patcher


class TestRequestPayload:
    async def test_payload_shape(self, png_b64):
        requests, patcher = _fake_http()
        with patcher:
            result = await gemini.extract([png_b64], 'SUMA PLN 12.47')
        assert result == RAW_JSON

        (request,) = requests
        assert request['url'].endswith(f'/models/{settings.gemini_model}:generateContent')
        assert request['headers'] == {'x-goog-api-key': 'test-key'}

        payload = request['json']
        assert payload['systemInstruction'] == {'parts': [{'text': llm.SYSTEM_PROMPT}]}
        parts = payload['contents'][0]['parts']
        assert parts[0] == {'text': 'Extract this receipt.'}
        assert parts[1] == {'inline_data': {'mime_type': 'image/png', 'data': png_b64}}
        assert parts[2]['text'].startswith(llm.TRANSCRIPT_PREAMBLE)
        assert parts[2]['text'].endswith('SUMA PLN 12.47')

        config = payload['generationConfig']
        assert config['temperature'] == 0
        assert config['responseMimeType'] == 'application/json'
        assert config['thinkingConfig'] == {'thinkingLevel': 'LOW'}
        # No schema by design — constrained decoding scrambles fields on this
        # model family (see module docstring). The prompt carries the shape.
        assert 'responseSchema' not in config

    async def test_transcript_is_truncated(self, png_b64):
        requests, patcher = _fake_http()
        with mock.patch.object(settings, 'transcript_max_chars', 10), patcher:
            await gemini.extract([png_b64], 'x' * 50)
        assert requests[0]['json']['contents'][0]['parts'][-1]['text'] == llm.TRANSCRIPT_PREAMBLE + 'x' * 10

    async def test_empty_thinking_level_omits_thinking_config(self, png_b64):
        requests, patcher = _fake_http()
        with mock.patch.object(settings, 'gemini_thinking_level', ''), patcher:
            await gemini.extract([png_b64])
        assert 'thinkingConfig' not in requests[0]['json']['generationConfig']

    async def test_missing_api_key_never_calls_out(self, png_b64):
        requests, patcher = _fake_http()
        with mock.patch.object(settings, 'gemini_api_key', ''), patcher, pytest.raises(ModelUnavailable):
            await gemini.extract([png_b64])
        assert requests == []


class TestResponseParsing:
    async def test_multi_part_text_is_joined(self, png_b64):
        body = {'candidates': [{'content': {'parts': [{'text': '{"total": '}, {'text': 'null}'}]}}]}
        _, patcher = _fake_http([_FakeResponse(body=body)])
        with patcher:
            assert await gemini.extract([png_b64]) == RAW_JSON

    async def test_no_candidates_raises_model_unavailable(self, png_b64):
        body = {'candidates': [], 'promptFeedback': {'blockReason': 'SAFETY'}}
        _, patcher = _fake_http([_FakeResponse(body=body)])
        with patcher, pytest.raises(ModelUnavailable):
            await gemini.extract([png_b64])

    async def test_empty_text_raises_model_unavailable(self, png_b64):
        body = {'candidates': [{'content': {'parts': []}}]}
        _, patcher = _fake_http([_FakeResponse(body=body)])
        with patcher, pytest.raises(ModelUnavailable):
            await gemini.extract([png_b64])

    async def test_http_error_raises_model_unavailable(self, png_b64):
        _, patcher = _fake_http([_FakeResponse(status_code=503)])
        with patcher, pytest.raises(ModelUnavailable):
            await gemini.extract([png_b64])


class TestProviderDispatch:
    async def test_llm_extract_dispatches_to_gemini(self, png_b64):
        with (
            mock.patch.object(settings, 'model_provider', 'gemini'),
            mock.patch.object(gemini, 'extract', mock.AsyncMock(return_value=RAW_JSON)) as gemini_extract,
        ):
            assert await llm.extract([png_b64], 'transcript') == RAW_JSON
        gemini_extract.assert_awaited_once_with([png_b64], 'transcript')

    async def test_llm_ping_dispatches_to_gemini(self):
        with (
            mock.patch.object(settings, 'model_provider', 'gemini'),
            mock.patch.object(gemini, 'ping', mock.AsyncMock()) as gemini_ping,
        ):
            await llm.ping()
        gemini_ping.assert_awaited_once()

    async def test_default_provider_untouched(self, png_b64):
        # The openai path must not import or call gemini at all.
        with mock.patch.object(gemini, 'extract', mock.AsyncMock()) as gemini_extract:
            from tests.test_llm import _fake_http as _fake_openai_http

            _, patcher = _fake_openai_http()
            with patcher:
                await llm.extract([png_b64])
        gemini_extract.assert_not_awaited()


class TestPing:
    async def test_ping_ok(self):
        requests, patcher = _fake_http()
        with patcher:
            await gemini.ping()
        assert requests[0]['url'].endswith(f'/models/{settings.gemini_model}')
        assert requests[0]['headers'] == {'x-goog-api-key': 'test-key'}

    async def test_ping_failure_raises(self):
        _, patcher = _fake_http([_FakeResponse(status_code=403)])
        with patcher, pytest.raises(ModelUnavailable):
            await gemini.ping()

    async def test_ping_without_key_raises(self):
        with mock.patch.object(settings, 'gemini_api_key', ''), pytest.raises(ModelUnavailable):
            await gemini.ping()
