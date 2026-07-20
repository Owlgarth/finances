"""Mock OpenAI-compatible model server emulating the Gemma 4 / llama.cpp endpoint.

Stands in for the real model host while its thinking behaviour is being fixed
(see README § Mock model server), so the parser and this harness can run
end-to-end without GPU hardware. The response envelope mirrors what llama-server
(b9972, --reasoning-format on) returns for gemma-4-12B-it:

  * the assistant message carries BOTH ``reasoning_content`` (the model's
    thinking, split out by the server) and ``content`` (the final answer);
  * if ``max_tokens`` is smaller than the thinking phase, the real server
    answers HTTP 200 with ``finish_reason: "length"`` and EMPTY content — the
    mock reproduces that whenever a request's max_tokens <= --thinking-tokens,
    so the parser's failure path (must be model_unavailable, never a 500) stays
    testable. The parser itself sends no max_tokens and always gets the answer.

Extraction quality is faked: the first incoming image is matched pixel-exactly
against ``fixtures/<name>/receipt.png`` and that fixture's expected.json is
echoed back in contract shape. Unmatched images get ``{"error": "unreadable"}``.
Scores against this mock are therefore 100% by construction — they verify the
pipeline (decode → LLM call → normalize → contract), never model quality; do
not paste them into the model table in README.md.

Document confidences are deliberately mid-range so the parser's deterministic
transcript grounding stays visible in A/B runs: with OCR off the response keeps
total=0.72 / items=0.66, with OCR on the grounding floor lifts both to >= 0.9.

Usage:
    uv run python mock_model.py [--port 8091] [--thinking-tokens 512]
then point the parser at it:
    PARSER_MODEL_BASE_URL=http://localhost:8091/v1 PARSER_MODEL_NAME=helper-agent
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from PIL import Image

FIXTURES_DIR = Path(__file__).parent / 'fixtures'

REASONING_TEXT = (
    'I need to extract structured data from this receipt image. I can see the merchant '
    'header, a list of line items with prices, and a total row. Let me transcribe the '
    'rows, cross-check the amounts and the date, and emit exactly one JSON object.'
)

DOC_CONFIDENCE = {'merchant': 0.85, 'date': 0.8, 'currency': 0.85, 'total': 0.72, 'items': 0.66}
ITEM_CONFIDENCE = 0.9

# Rough prompt-size model: chat scaffold + 256 vision tokens per image (Gemma's
# mmproj emits 256) + ~4 chars/token for text blocks. Only used for `usage`.
PROMPT_BASE_TOKENS = 90
TOKENS_PER_IMAGE = 256


def _pixel_key(image: Image.Image) -> str:
    rgb = image.convert('RGB')
    return hashlib.sha256(f'{rgb.size}'.encode() + rgb.tobytes()).hexdigest()


def _load_fixture_index() -> dict[str, tuple[str, dict]]:
    index: dict[str, tuple[str, dict]] = {}
    if not FIXTURES_DIR.exists():
        return index
    for case_dir in sorted(FIXTURES_DIR.iterdir()):
        receipt, expected = case_dir / 'receipt.png', case_dir / 'expected.json'
        if not (case_dir.is_dir() and receipt.exists() and expected.exists()):
            continue
        with Image.open(receipt) as image:
            index[_pixel_key(image)] = (case_dir.name, json.loads(expected.read_text()))
    return index


def _extraction_content(expected: dict) -> str:
    items = [
        {
            'name': item['name'],
            'quantity': item.get('quantity', '1'),
            'unit_price': item.get('unit_price'),
            'line_total': item.get('line_total'),
            'confidence': ITEM_CONFIDENCE,
        }
        for item in expected.get('items', [])
    ]
    return json.dumps(
        {
            'merchant': expected.get('merchant'),
            'date': expected.get('date'),
            'currency': expected.get('currency'),
            'total': expected.get('total'),
            'items': items,
            'confidence': DOC_CONFIDENCE,
            'warnings': [],
        }
    )


def _request_blocks(payload: dict) -> tuple[list[str], int]:
    """First-image data URIs and a text-char count from every user message."""
    images: list[str] = []
    text_chars = 0
    for message in payload.get('messages', []):
        content = message.get('content')
        if isinstance(content, str):
            text_chars += len(content)
            continue
        for block in content or []:
            if block.get('type') == 'image_url':
                images.append(block.get('image_url', {}).get('url', ''))
            elif block.get('type') == 'text':
                text_chars += len(block.get('text', ''))
    return images, text_chars


class MockModelHandler(BaseHTTPRequestHandler):
    fixture_index: dict[str, tuple[str, dict]] = {}
    thinking_tokens: int = 512

    def log_message(self, *_args) -> None:  # quiet the default per-request line
        pass

    def _send_json(self, status: int, body: dict) -> None:
        raw = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:
        if self.path.rstrip('/') == '/v1/models':
            model = {'id': 'helper-agent', 'object': 'model', 'created': int(time.time()), 'owned_by': 'llamacpp'}
            self._send_json(200, {'object': 'list', 'data': [model], 'models': [model]})
        else:
            self._send_json(404, {'error': {'message': f'unknown path {self.path}'}})

    def do_POST(self) -> None:
        if self.path.rstrip('/') != '/v1/chat/completions':
            self._send_json(404, {'error': {'message': f'unknown path {self.path}'}})
            return
        try:
            payload = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))))
        except (ValueError, TypeError):
            self._send_json(400, {'error': {'message': 'invalid JSON body'}})
            return

        response_format = (payload.get('response_format') or {}).get('type', 'text')
        if response_format not in ('text', 'json_object', 'json_schema'):
            self._send_json(400, {'error': {'message': f'unsupported response_format {response_format}'}})
            return

        images, text_chars = _request_blocks(payload)
        fixture_name, content = 'no-image', json.dumps({'error': 'unreadable'})
        if images:
            fixture_name = 'unmatched'
            try:
                b64 = images[0].split('base64,', 1)[1]
                with Image.open(io.BytesIO(base64.b64decode(b64))) as image:
                    match = self.fixture_index.get(_pixel_key(image))
            except (ValueError, OSError, IndexError):
                match = None
            if match:
                fixture_name, expected = match
                content = _extraction_content(expected)

        # Faithful llama.cpp failure mode: thinking eats the whole token budget,
        # the answer never starts, yet the HTTP status is still 200.
        max_tokens = payload.get('max_tokens') or payload.get('max_completion_tokens')
        exhausted = max_tokens is not None and max_tokens <= self.thinking_tokens
        finish_reason = 'length' if exhausted else 'stop'
        answer = '' if exhausted else content

        prompt_tokens = PROMPT_BASE_TOKENS + TOKENS_PER_IMAGE * len(images) + text_chars // 4
        completion_tokens = self.thinking_tokens + len(answer) // 4
        self._send_json(
            200,
            {
                'id': f'chatcmpl-mock{int(time.time() * 1000)}',
                'object': 'chat.completion',
                'created': int(time.time()),
                'model': payload.get('model', 'helper-agent'),
                'choices': [
                    {
                        'finish_reason': finish_reason,
                        'index': 0,
                        'message': {'role': 'assistant', 'content': answer, 'reasoning_content': REASONING_TEXT},
                    }
                ],
                'usage': {
                    'completion_tokens': completion_tokens,
                    'prompt_tokens': prompt_tokens,
                    'total_tokens': prompt_tokens + completion_tokens,
                    'prompt_tokens_details': {'cached_tokens': 0},
                },
            },
        )
        print(
            f'[mock] fixture={fixture_name} images={len(images)} format={response_format} finish={finish_reason}',
            file=sys.stderr,
        )


def main() -> int:
    argp = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    argp.add_argument('--port', type=int, default=8091)
    argp.add_argument('--thinking-tokens', type=int, default=512, help='simulated reasoning budget (see docstring)')
    args = argp.parse_args()

    MockModelHandler.fixture_index = _load_fixture_index()
    MockModelHandler.thinking_tokens = args.thinking_tokens
    if not MockModelHandler.fixture_index:
        print('No fixtures found — run: uv run python generate_fixtures.py', file=sys.stderr)
        return 2

    server = ThreadingHTTPServer(('127.0.0.1', args.port), MockModelHandler)
    print(
        f'[mock] gemma4-shaped mock model on http://127.0.0.1:{args.port}/v1 '
        f'({len(MockModelHandler.fixture_index)} fixtures, thinking-tokens={args.thinking_tokens})',
        file=sys.stderr,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
