# Denarly Receipt Parser

A small, **stateless** FastAPI service that turns a receipt image or PDF into
structured JSON. It implements [`CONTRACT.md`](./CONTRACT.md) v1 and persists
nothing — one request in, one JSON document out.

Model access is selected entirely by environment variables, with two backends:

- **`openai`** (default) — any OpenAI-compatible vision chat-completions
  endpoint: a local runtime (llama.cpp, Ollama, vLLM) or a hosted provider.
- **`gemini`** — the Google Gemini API (native REST, no SDK), for when the
  self-hosted box is down or a hosted fallback is preferred:
  `PARSER_MODEL_PROVIDER=gemini` + `PARSER_GEMINI_API_KEY=<key>`.

Both backends share the same prompt, transcript grounding, and contract-shaped
structured output; switching is one env change.

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
| `PARSER_MODEL_PROVIDER` | `openai` | Extraction backend: `openai` (any OpenAI-compatible endpoint) or `gemini` (Google Gemini API). |
| `PARSER_MODEL_BASE_URL` | `http://localhost:11434/v1` | *(openai)* OpenAI-compatible chat-completions endpoint. |
| `PARSER_MODEL_NAME` | `qwen2.5-vl` | *(openai)* Model id at that endpoint. |
| `PARSER_MODEL_API_KEY` | `not-needed` | *(openai)* Key for the endpoint (any value for local runtimes). |
| `PARSER_MODEL_TIMEOUT_SECONDS` | `90` | Per-request model timeout (both providers). |
| `PARSER_STRUCTURED_OUTPUT` | `json_schema` | *(openai)* `json_schema` constrains decoding to the contract shape; a 4xx rejection falls back to `json_object` for the rest of the process. |
| `PARSER_GEMINI_API_KEY` | *(empty)* | *(gemini)* Google AI Studio API key — required when the provider is `gemini`. |
| `PARSER_GEMINI_MODEL` | `gemini-3.1-flash-lite` | *(gemini)* Gemini model id. |
| `PARSER_GEMINI_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta` | *(gemini)* API base (override for testing/proxies). |
| `PARSER_GEMINI_THINKING_LEVEL` | `low` | *(gemini)* Thinking level (`low`/`medium`/`high`); empty leaves the provider default. Receipts are simple — low keeps latency and cost down. |
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

```bash
docker compose up -d --build          # uses this directory's docker-compose.yml
# or standalone:
docker build -t denarly-receipt-parser .
docker run --rm -p 8100:8100 --env-file .env denarly-receipt-parser
```

## Deployment

The parser is **not** part of the repo's top-level stack. That stack (Django,
React, postgres, redis, celery) runs on a VPS for 24/7 availability; the parser
deploys on the **home server** alongside the LLM, so the parser→LLM hop and OCR
stay local to the GPU box:

```
   VPS (always on)                        home server (intermittent, GPU)
 ┌───────────────────────┐   tailnet    ┌──────────────────────────────────┐
 │ django + celery       │─────────────►│ receipt-parser :8100  ─► LLM     │
 │   PARSER_URL ─────────┼──────────────┤ (docker compose here)  (host)    │
 └───────────────────────┘              └──────────────────────────────────┘
```

**Wiring it up:**

1. Install [Tailscale](https://tailscale.com/) on both hosts (`tailscale up`) and
   note the home server's tailnet IP (`tailscale ip -4`, a `100.x.y.z` address).
2. On the home server, set `PARSER_BIND_ADDR` to that IP in `.env` and start the
   stack. The port binds to the tailnet interface only — never `0.0.0.0`, which
   would expose a path toward the LLM. The default (`127.0.0.1`) fails safe.
3. On the VPS, set `PARSER_URL=http://100.x.y.z:8100` and
   `PARSER_API_TOKEN` (matching the parser's) in the backend env.

`PARSER_API_TOKEN` stays required as defense-in-depth even on a private mesh.

**The home server is intermittently available, and that is a normal state, not an
error.** When it is off the backend degrades rather than failing:

- `GET /api/transactions/extraction/config` reports `reachable: false` (live probe,
  short-TTL cached), so the UI relabels the "From receipt" affordance as offline
  instead of letting an upload fail.
- Queued attachment extractions stay retryable — the Celery task retries with
  exponential backoff over ~12 hours (tunable via `PARSER_EXTRACT_*` on the
  backend), so receipts uploaded while the home server is down are picked up
  when it returns. A 4xx from `/parse` is *not* retried: that file would be
  rejected identically every time.

If `PARSER_URL` is unset entirely, the backend hides every extraction affordance —
the service is fully optional.

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
