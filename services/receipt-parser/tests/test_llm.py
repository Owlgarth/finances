"""Request-payload tests for llm.extract — transcript block placement and
truncation, structured-output modes, and the json_schema → json_object
fallback. The HTTP client is faked so nothing leaves the process."""

from unittest import mock

import httpx
import pytest

from app import llm
from app.config import settings


@pytest.fixture(autouse=True)
def _reset_schema_fallback():
    llm._schema_rejected = False
    yield
    llm._schema_rejected = False


class _FakeResponse:
    def __init__(self, status_code: int = 200):
        self.status_code = status_code

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            request = httpx.Request('POST', 'http://fake/chat/completions')
            response = httpx.Response(self.status_code, request=request)
            raise httpx.HTTPStatusError(f'HTTP {self.status_code}', request=request, response=response)

    def json(self) -> dict:
        return {'choices': [{'message': {'content': '{"total": null}'}}]}


class _FakeClient:
    """Records every request payload; answers with queued status codes (then 200s)."""

    def __init__(self, requests: list, statuses: list[int], **_kwargs):
        self._requests = requests
        self._statuses = statuses

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc) -> bool:
        return False

    async def post(self, url, json=None, headers=None) -> _FakeResponse:
        self._requests.append(json)
        return _FakeResponse(self._statuses.pop(0) if self._statuses else 200)


def _fake_http(statuses: list[int] | None = None) -> tuple[list, mock._patch]:
    requests: list = []
    remaining = list(statuses or [])  # shared across client instantiations
    patcher = mock.patch.object(llm.httpx, 'AsyncClient', lambda **kwargs: _FakeClient(requests, remaining, **kwargs))
    return requests, patcher


async def _extract_capturing(images_b64: list[str], transcript: str | None) -> list:
    requests, patcher = _fake_http()
    with patcher:
        await llm.extract(images_b64, transcript)
    return requests


class TestTranscriptBlock:
    async def test_payload_without_transcript(self, png_b64):
        (payload,) = await _extract_capturing([png_b64], None)
        content = payload['messages'][1]['content']
        assert [block['type'] for block in content] == ['text', 'image_url']
        assert content[0]['text'] == 'Extract this receipt.'

    async def test_payload_with_transcript_appends_text_block(self, png_b64):
        (payload,) = await _extract_capturing([png_b64, png_b64], 'SUMA PLN 12.47')
        content = payload['messages'][1]['content']
        assert [block['type'] for block in content] == ['text', 'image_url', 'image_url', 'text']
        transcript_block = content[-1]['text']
        assert transcript_block.startswith(llm.TRANSCRIPT_PREAMBLE)
        assert transcript_block.endswith('SUMA PLN 12.47')

    async def test_transcript_is_truncated(self, png_b64):
        requests, patcher = _fake_http()
        with mock.patch.object(settings, 'transcript_max_chars', 10), patcher:
            await llm.extract([png_b64], 'x' * 50)
        transcript_block = requests[0]['messages'][1]['content'][-1]['text']
        assert transcript_block == llm.TRANSCRIPT_PREAMBLE + 'x' * 10

    async def test_empty_transcript_sends_no_block(self, png_b64):
        (payload,) = await _extract_capturing([png_b64], '')
        content = payload['messages'][1]['content']
        assert [block['type'] for block in content] == ['text', 'image_url']


class TestEmptyContent:
    """A thinking model that runs out of tokens returns 200 with empty content
    (answer text goes to reasoning_content) — must map to ModelUnavailable."""

    @pytest.mark.parametrize('content', ['', None])
    async def test_empty_content_raises_model_unavailable(self, png_b64, content):
        from app.errors import ModelUnavailable

        def _empty_json(_self) -> dict:
            return {'choices': [{'message': {'content': content, 'reasoning_content': 'thinking…'}}]}

        requests, patcher = _fake_http()
        with patcher, mock.patch.object(_FakeResponse, 'json', _empty_json), pytest.raises(ModelUnavailable):
            await llm.extract([png_b64])
        assert len(requests) == 1  # empty content is not a schema rejection — no json_object fallback


class TestStructuredOutput:
    async def test_default_mode_sends_json_schema(self, png_b64):
        (payload,) = await _extract_capturing([png_b64], None)
        response_format = payload['response_format']
        assert response_format['type'] == 'json_schema'
        assert response_format['json_schema']['schema'] == llm.RESPONSE_SCHEMA

    async def test_json_object_mode(self, png_b64):
        requests, patcher = _fake_http()
        with mock.patch.object(settings, 'structured_output', 'json_object'), patcher:
            await llm.extract([png_b64])
        assert requests[0]['response_format'] == {'type': 'json_object'}

    async def test_schema_rejection_falls_back_and_is_remembered(self, png_b64):
        requests, patcher = _fake_http(statuses=[400])
        with patcher:
            result = await llm.extract([png_b64])
        assert result == '{"total": null}'
        assert [request['response_format']['type'] for request in requests] == ['json_schema', 'json_object']

        # Subsequent calls in the same process skip json_schema entirely.
        requests, patcher = _fake_http()
        with patcher:
            await llm.extract([png_b64])
        assert [request['response_format']['type'] for request in requests] == ['json_object']

    async def test_server_error_does_not_trigger_fallback(self, png_b64):
        from app.errors import ModelUnavailable

        requests, patcher = _fake_http(statuses=[503])
        with patcher, pytest.raises(ModelUnavailable):
            await llm.extract([png_b64])
        assert len(requests) == 1  # no retry — 5xx means unavailable, not incompatible
        assert llm._schema_rejected is False
