"""Request-payload tests for llm.extract — the transcript block is appended
after the images, framed as machine-extracted, and truncated to the limit.
The HTTP client is faked so nothing leaves the process."""

from unittest import mock

from app import llm
from app.config import settings


class _FakeResponse:
    def raise_for_status(self) -> None:
        pass

    def json(self) -> dict:
        return {'choices': [{'message': {'content': '{"total": null}'}}]}


class _FakeClient:
    def __init__(self, captured: dict, **_kwargs):
        self._captured = captured

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc) -> bool:
        return False

    async def post(self, url, json=None, headers=None) -> _FakeResponse:
        self._captured.update({'url': url, 'payload': json, 'headers': headers})
        return _FakeResponse()


async def _extract_capturing(images_b64: list[str], transcript: str | None) -> dict:
    captured: dict = {}
    with mock.patch.object(llm.httpx, 'AsyncClient', lambda **kwargs: _FakeClient(captured, **kwargs)):
        await llm.extract(images_b64, transcript)
    return captured


async def test_payload_without_transcript(png_b64):
    captured = await _extract_capturing([png_b64], None)
    content = captured['payload']['messages'][1]['content']
    assert [block['type'] for block in content] == ['text', 'image_url']
    assert content[0]['text'] == 'Extract this receipt.'


async def test_payload_with_transcript_appends_text_block(png_b64):
    captured = await _extract_capturing([png_b64, png_b64], 'SUMA PLN 12.47')
    content = captured['payload']['messages'][1]['content']
    assert [block['type'] for block in content] == ['text', 'image_url', 'image_url', 'text']
    transcript_block = content[-1]['text']
    assert transcript_block.startswith(llm.TRANSCRIPT_PREAMBLE)
    assert transcript_block.endswith('SUMA PLN 12.47')


async def test_transcript_is_truncated(png_b64):
    with mock.patch.object(settings, 'transcript_max_chars', 10):
        captured = await _extract_capturing([png_b64], 'x' * 50)
    transcript_block = captured['payload']['messages'][1]['content'][-1]['text']
    assert transcript_block == llm.TRANSCRIPT_PREAMBLE + 'x' * 10


async def test_empty_transcript_sends_no_block(png_b64):
    captured = await _extract_capturing([png_b64], '')
    content = captured['payload']['messages'][1]['content']
    assert [block['type'] for block in content] == ['text', 'image_url']
