# Denarly Receipt Parser

A small, **stateless** FastAPI service that turns a receipt image or PDF into
structured JSON. It implements [`API.md`](./API.md) v1 and persists
nothing — one request in, one JSON document out.

Extraction is **hybrid**: a vision model sees the receipt image(s) alongside a
machine-extracted text transcript (PDF text layer or local OCR), and the
transcript is then used to deterministically fact-check the model's numbers and
ground the confidence scores. The model backend is chosen by env var — any
OpenAI-compatible vision endpoint (local llama.cpp/Ollama/vLLM or hosted), or
the Google Gemini API — with no other pipeline difference.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/parse` | `multipart/form-data` with a `file` field → contract JSON |
| `GET` | `/health` | `200` when the model endpoint is reachable, else `503` |

Auth: `Authorization: Bearer <PARSER_API_TOKEN>`. When the token env var is
unset the check is disabled (local/testing only) — **always set it in
deployments.**

## Limits

| Limit | Default | Configured by |
|-------|---------|---------------|
| Accepted file types | JPEG, PNG, WebP, HEIC/HEIF, PDF | — (anything else → `400 unsupported_media_type`) |
| Max upload size | 15 MB | `PARSER_MAX_FILE_MB` (above → `400 file_too_large`) |
| PDF pages processed | first 10 | `PARSER_PDF_MAX_PAGES` (extra pages dropped + `multi_page_merged` warning) |
| Transcript sent to the model | 8 000 chars | `PARSER_TRANSCRIPT_MAX_CHARS` (truncated, grounding still uses the full text) |
| Model call timeout | 90 s | `PARSER_MODEL_TIMEOUT_SECONDS` |

## Configuration

All settings are environment variables prefixed `PARSER_`, read from the
environment or a local `.env` (copy `.env.example`).

| Variable | Default | Purpose |
|----------|---------|---------|
| `PARSER_API_TOKEN` | *(empty)* | Bearer token required from callers. Empty disables auth — local/testing only. |
| `PARSER_MODEL_PROVIDER` | `openai` | Extraction backend: `openai` (any OpenAI-compatible endpoint) or `gemini` (Google Gemini API). |
| `PARSER_MODEL_BASE_URL` | `http://localhost:11434/v1` | *(openai)* OpenAI-compatible chat-completions endpoint. |
| `PARSER_MODEL_NAME` | `qwen2.5-vl` | *(openai)* Model id at that endpoint. |
| `PARSER_MODEL_API_KEY` | `not-needed` | *(openai)* Key for the endpoint (any value for local runtimes). |
| `PARSER_STRUCTURED_OUTPUT` | `json_schema` | *(openai)* Constrained decoding; a 4xx rejection falls back to `json_object` for the rest of the process. |
| `PARSER_GEMINI_API_KEY` | *(empty)* | *(gemini)* Google AI Studio API key — required when the provider is `gemini`. |
| `PARSER_GEMINI_MODEL` | `gemini-3.1-flash-lite` | *(gemini)* Gemini model id. |
| `PARSER_GEMINI_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta` | *(gemini)* API base (override for testing/proxies). |
| `PARSER_GEMINI_THINKING_LEVEL` | `low` | *(gemini)* Thinking level (`low`/`medium`/`high`); empty leaves the provider default. |
| `PARSER_MODEL_TIMEOUT_SECONDS` | `90` | Per-request model timeout (both providers). |
| `PARSER_MAX_FILE_MB` | `15` | Upload size cap. |
| `PARSER_PDF_RENDER_SCALE` | `2.0` | PDF rasterization scale (~144 DPI at 2.0). |
| `PARSER_PDF_MAX_PAGES` | `10` | Pages beyond this are dropped (adds `multi_page_merged`). |
| `PARSER_TRANSCRIPT_MAX_CHARS` | `8000` | Transcript truncation before it is sent to the model. |
| `PARSER_OCR_ENABLED` | `true` | RapidOCR grounding for photos/scans; off or failing degrades to vision-only. |

## How it works

```
file ──► pre-process ──► extract ──► post-process ──► contract JSON
         images + text    model      validate, derive
         transcript                  warnings, ground
                                     confidence
```

1. **Pre-process** — validate size/type, rasterize PDF pages, split extreme-aspect
   photos into overlapping tiles, and machine-read the text (PDF text layer or
   RapidOCR, CPU-only, baked into the image).
2. **Extract** — images plus the advisory transcript go to the model, which
   returns contract-shaped JSON.
3. **Post-process** — every field is defensively coerced; arithmetic warnings
   are derived (never trusted from the model); the transcript's money tokens
   fact-check the model's total and line totals, flooring or capping confidence.

Every stage degrades gracefully: OCR off or broken means vision-only extraction
plus an `ocr_unavailable` warning — never a 5xx.

Full detail per stage, including the response structure:
[`docs/pipeline.md`](./docs/pipeline.md).

## Run locally

```bash
uv sync
uv run uvicorn app.main:app --reload --port 8100

curl -s http://localhost:8100/parse \
  -H "Authorization: Bearer $PARSER_API_TOKEN" \
  -F file=@receipt.jpg | jq
```

## Run with Docker

```bash
docker compose up -d --build          # uses this directory's docker-compose.yml
# or standalone:
docker build -t denarly-receipt-parser .
docker run --rm -p 8100:8100 --env-file .env denarly-receipt-parser
```

## Tests

```bash
uv run pytest
```

Tests mock both the model call and the OCR engine, so they run offline and
deterministically.

## Documentation

- [`API.md`](./API.md) — the frozen v1 API contract: field semantics,
  warning codes, error shapes, worked examples.
- [`docs/pipeline.md`](./docs/pipeline.md) — the processing pipeline in detail:
  pre-processing, extraction backends, post-processing, response structure.
- [`docs/deployment.md`](./docs/deployment.md) — deployment topologies (home
  server + local LLM over tailnet, or same-VPS with Gemini) and how the backend
  degrades when the parser is offline.
