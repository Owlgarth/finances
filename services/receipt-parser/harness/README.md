# Parser quality harness

Measures how well a configured model extracts receipts, so you can compare models
and catch regressions. Fixtures are synthetic receipts rendered from text specs
(reproducible, multi-language, multi-currency); drop real photographed receipts
into `fixtures/<name>/receipt.png` + `expected.json` to extend the corpus.

## Run

```bash
# 1. (re)generate fixture images from specs.py
uv run python generate_fixtures.py

# 2. start the parser (see ../README.md) pointed at the model under test, then:
uv run python score.py --url http://localhost:8100 --token "$PARSER_API_TOKEN"
```

`score.py` POSTs each fixture to the live `/parse` endpoint and prints a per-fixture
table plus aggregate means:

```
fixture                     total  curr  date  merch  items
-----------------------------------------------------------
cafe_eur                        ✓     ✓     ✓      ✓   100%
grocery_gbp_discount            ✓     ✓     ✓      ✓    100%
hardware_usd                    ✓     ✓     ✓      ✓   100%
lidl_pln_groceries              ✓     ✓     ✓      ✓   100%
-----------------------------------------------------------
MEAN                          100%  100%  100%   100%   100%
```

## Metrics

| Column | Meaning |
|--------|---------|
| `total` | Parsed grand total exactly equals expected (decimal string). |
| `curr` | Parsed ISO currency matches. |
| `date` | Parsed `YYYY-MM-DD` matches. |
| `merch` | Case-insensitive substring match either direction. |
| `items` | Item recall: fraction of expected items matched by fuzzy name **and** exact line total. |

Totals accuracy and item recall are the two headline numbers per the P3 spec.

## Mock model server (no GPU needed)

`mock_model.py` is a stdlib OpenAI-compatible stand-in for the real model host,
shaped after what llama-server (b9972, `--reasoning-format` on) returns for
Gemma 4 12B. Use it to exercise the parser pipeline end-to-end when the real
endpoint is unavailable or misbehaving:

```bash
uv run python mock_model.py --port 8091            # terminal 1
# terminal 2 — point the parser at it, then score as usual:
PARSER_MODEL_BASE_URL=http://127.0.0.1:8091/v1 PARSER_MODEL_NAME=helper-agent \
PARSER_MODEL_API_KEY=mock PARSER_API_TOKEN= uvicorn app.main:app --port 8100
uv run python score.py --url http://localhost:8100
```

The response envelope it emulates (the parser reads `choices[0].message.content`;
the rest is faithful decoration):

```json
{
  "object": "chat.completion",
  "model": "helper-agent",
  "choices": [{
    "index": 0,
    "finish_reason": "stop",
    "message": {
      "role": "assistant",
      "reasoning_content": "…the model's thinking, split out by the server…",
      "content": "{…contract-shaped extraction JSON…}"
    }
  }],
  "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0,
            "prompt_tokens_details": {"cached_tokens": 0}}
}
```

Two behaviours matter:

- **Thinking models answer late.** `content` fills only after the reasoning
  phase. A request whose `max_tokens` is at or below the thinking budget comes
  back **HTTP 200** with `finish_reason: "length"` and **empty `content`** —
  the mock reproduces this whenever `max_tokens <= --thinking-tokens` (the
  parser sends no `max_tokens`, so it always gets the answer). The parser maps
  empty content to `model_unavailable` (503, retryable), never a bare 500.
- **Extraction is an echo.** Incoming images are pixel-matched against
  `fixtures/`; the fixture's `expected.json` comes back with mid-range
  confidences (total 0.72, items 0.66) so the parser's transcript-grounding
  floors stay visible in OCR-off vs OCR-on runs. Unmatched images get
  `{"error": "unreadable"}`. Scores against the mock are **100% by
  construction** — they verify the pipeline, not the model. Never paste them
  into the model table below.

## Recommended model

For self-hosted use, **`qwen2.5-vl` (7B)** served via Ollama or vLLM is the
recommended starting point: it handles multi-language receipts and follows the
JSON-only instruction reliably at `temperature=0`. Smaller 2–3B vision models tend
to drop line items and misread thermal-print digits; larger hosted models
(`gpt-4o`, `claude-*` vision) score higher on messy photos at higher cost.

To record scores for a model, run `score.py` against it and paste the MEAN row
here with the model name and date. Numbers depend on your fixtures and hardware,
so treat them as a local baseline for regression comparison rather than an
absolute benchmark.

| Model | Date | total | curr | date | merch | items |
|-------|------|-------|------|------|-------|-------|
| gemini-3.1-flash-lite (hybrid, OCR on) | 2026-07-20 | 100% | 100% | 100% | 100% | 100% |
| gemini-3.1-flash-lite (vision-only, OCR off) | 2026-07-20 | 100% | 100% | 100% | 100% | 100% |
