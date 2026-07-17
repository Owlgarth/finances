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

```
file ──► decode (app/images.py)
          │  images:     base64 PNGs — PDF pages rasterized; extreme-aspect
          │              photos split into overlapping vertical tiles
          │  transcript: PDF text layer (born-digital, > ~80 chars/page)
          │              or RapidOCR (photos & scanned PDFs, app/ocr.py)
          │              or none (ocr_unavailable warning)
          ▼
         extract (app/llm.py) — images + advisory transcript
          │  response_format: json_schema, falling back to json_object
          ▼
         normalize (app/parser.py) — defensive coercion, arithmetic checks,
          │                          transcript grounding of confidence
          ▼
         contract JSON (CONTRACT.md v1)
```

1. **Decode** (`app/images.py`) — the upload becomes base64 PNGs (PDF pages are
   rasterized). Born-digital PDFs (> ~80 extracted chars/page) yield a
   transcript from their embedded text layer; photos and scanned PDFs are
   transcribed with RapidOCR (`app/ocr.py`, CPU, models baked into the image).
   **Multi-image inputs**: multi-page PDFs send one image per page, and very
   long receipt photos (height > 2.5× width and > 2000 px) are split into
   vertical tiles with ~15% overlap — the prompt tells the model not to
   duplicate items from the overlap. OCR always runs on the whole image.
2. **Extract** (`app/llm.py`) — images plus the transcript (framed as
   machine-extracted: digits reliable, layout imperfect) go to the model, which
   returns contract-shaped JSON, schema-constrained when the endpoint supports
   it.
3. **Normalize** (`app/parser.py`) — every field is defensively coerced, and all
   consistency warnings are derived here, never trusted from the model:
   arithmetic checks (`item_math_mismatch`, `total_mismatch`) plus transcript
   grounding — the total and item line totals are looked up among the
   transcript's money tokens and `confidence.total`/`confidence.items` are
   floored or capped accordingly (see `CONTRACT.md` → *Confidence grounding*).

Every stage degrades gracefully: OCR off or broken means vision-only extraction
plus an `ocr_unavailable` warning — never a 5xx.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/parse` | `multipart/form-data` with a `file` field (JPEG/PNG/HEIC/WebP/PDF) → contract JSON |
| `GET` | `/health` | `200` when the model endpoint is reachable, else `503` |

Auth: `Authorization: Bearer <PARSER_API_TOKEN>`. When the token env var is unset
the check is disabled (local/testing only) — **always set it in deployments.**

## Configuration

Copy `.env.example` to `.env` and edit. All variables are prefixed `PARSER_`:

| variable | default | purpose |
|----------|---------|---------|
| `PARSER_API_TOKEN` | *(empty)* | Bearer token required from callers. Empty disables auth — local/testing only. |
| `PARSER_MODEL_BASE_URL` | `http://localhost:11434/v1` | OpenAI-compatible chat-completions endpoint. |
| `PARSER_MODEL_NAME` | `qwen2.5-vl` | Model id at that endpoint. |
| `PARSER_MODEL_API_KEY` | `not-needed` | Key for the endpoint (any value for local runtimes). |
| `PARSER_MODEL_TIMEOUT_SECONDS` | `90` | Per-request model timeout. |
| `PARSER_STRUCTURED_OUTPUT` | `json_schema` | `json_schema` constrains decoding to the contract shape; a 4xx rejection falls back to `json_object` for the rest of the process. |
| `PARSER_MAX_FILE_MB` | `15` | Upload size cap. |
| `PARSER_PDF_RENDER_SCALE` | `2.0` | PDF rasterization scale (~144 DPI at 2.0). |
| `PARSER_PDF_MAX_PAGES` | `10` | Pages beyond this are dropped (adds `multi_page_merged`). |
| `PARSER_TRANSCRIPT_MAX_CHARS` | `8000` | Transcript truncation before it is sent to the model. |
| `PARSER_OCR_ENABLED` | `true` | RapidOCR grounding for photos/scans; off or failing degrades to vision-only. |

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

Tests mock both the model call and the OCR engine, so they run offline and
deterministically. `parser.py` derives arithmetic-consistency warnings and
transcript grounding itself (never trusting the model), so the contract holds
regardless of model quality.

## Choosing a model

Any vision model exposed over an OpenAI-compatible `/chat/completions` works. For
local, self-hosted use, `qwen2.5-vl` (7B) via Ollama is a good starting point;
see [`../../services/receipt-parser`](./) quality harness (P3) for measured
scores and the recommended pick.
