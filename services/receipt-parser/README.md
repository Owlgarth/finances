# Denarly Receipt Parser

A small, **stateless** FastAPI service that turns a receipt image or PDF into
structured JSON. It implements [`CONTRACT.md`](./CONTRACT.md) v1 and persists
nothing — one request in, one JSON document out.

It talks to any **OpenAI-compatible** vision chat-completions endpoint, selected
entirely by environment variables. Point it at a local runtime (Ollama, vLLM) or
a hosted provider without touching code.

## Pipeline

Extraction is **hybrid**: the vision model sees the receipt image(s), and — when
available — a machine-extracted text transcript whose digits are deterministic:

1. **Decode** (`app/images.py`) — the upload becomes base64 PNGs (PDF pages are
   rasterized). Born-digital PDFs (> ~80 extracted chars/page) also yield a
   transcript from their embedded text layer.
2. **Extract** (`app/llm.py`) — images plus the transcript (framed as
   machine-extracted: digits reliable, layout imperfect) go to the model, which
   returns contract-shaped JSON.
3. **Normalize** (`app/parser.py`) — every field is defensively coerced, and all
   consistency warnings are derived here, never trusted from the model:
   arithmetic checks (`item_math_mismatch`, `total_mismatch`) plus transcript
   grounding — the total and item line totals are looked up among the
   transcript's money tokens and `confidence.total`/`confidence.items` are
   floored or capped accordingly (see `CONTRACT.md` → *Confidence grounding*).

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/parse` | `multipart/form-data` with a `file` field (JPEG/PNG/HEIC/WebP/PDF) → contract JSON |
| `GET` | `/health` | `200` when the model endpoint is reachable, else `503` |

Auth: `Authorization: Bearer <PARSER_API_TOKEN>`. When the token env var is unset
the check is disabled (local/testing only) — **always set it in deployments.**

## Configuration

Copy `.env.example` to `.env` and edit. All variables are prefixed `PARSER_`.
Key ones: `PARSER_API_TOKEN`, `PARSER_MODEL_BASE_URL`, `PARSER_MODEL_NAME`,
`PARSER_MODEL_API_KEY`.

## Run locally

```bash
uv sync
uv run uvicorn app.main:app --reload --port 8100

curl -s http://localhost:8100/parse \
  -H "Authorization: Bearer $PARSER_API_TOKEN" \
  -F file=@receipt.jpg | jq
```

## Run with Docker

Built and wired into the repo's top-level `docker-compose.yml` as the
`denarly_receipt_parser` service (published on `:8100`). Or standalone:

```bash
docker build -t denarly-receipt-parser .
docker run --rm -p 8100:8100 --env-file .env denarly-receipt-parser
```

The Denarly backend reaches it at `http://denarly_receipt_parser:8100` inside the
compose network (see `PARSER_URL` in the backend env). If `PARSER_URL` is unset,
the backend hides every extraction affordance — the service is entirely optional.

## Tests

```bash
uv run pytest
```

Tests mock the model call, so they run offline and deterministically. `parser.py`
derives arithmetic-consistency warnings itself (never trusting the model), so the
contract holds regardless of model quality.

## Choosing a model

Any vision model exposed over an OpenAI-compatible `/chat/completions` works. For
local, self-hosted use, `qwen2.5-vl` (7B) via Ollama is a good starting point;
see [`../../services/receipt-parser`](./) quality harness (P3) for measured
scores and the recommended pick.
