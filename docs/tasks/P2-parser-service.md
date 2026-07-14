# P2 — Receipt parser FastAPI service

Size **M** · Deps: P1 · Plan: `IMPLEMENTATION_PLAN.md` · Roadmap §6 · Contract:
`services/receipt-parser/CONTRACT.md` (write P1 first; this task implements it exactly)

## Objective
Standalone, stateless FastAPI service in this monorepo: receives a receipt file, calls any
OpenAI-compatible vision model, returns contract-v1 JSON. Runs via docker-compose behind an
opt-in profile (the core stack must not require it or a local LLM).

## Read first
- `services/receipt-parser/CONTRACT.md` (P1 output — the source of truth)
- `.agents/skills/docker-infra/SKILL.md` (DNS-safe service names, compose conventions)
- `docker-compose.yml`, `example.env` (root) — patterns for env wiring

## Layout (new, self-contained — own venv/deps, NOT part of backend/)
```
services/receipt-parser/
├── app/
│   ├── __init__.py
│   ├── main.py          # FastAPI app, routes, auth dependency, error handlers
│   ├── config.py        # pydantic-settings Settings (env-driven)
│   ├── schemas.py       # pydantic models mirroring CONTRACT.md exactly
│   ├── llm.py           # OpenAI-compatible client call + response parsing/repair
│   ├── images.py        # decode/convert/downscale; HEIC via pillow-heif
│   └── pdf.py           # PDF → page images via pypdfium2
├── tests/
│   ├── conftest.py      # TestClient + mocked llm fixture
│   ├── test_api.py
│   └── fixtures/        # tiny generated jpg/png/pdf samples (created in tests or checked in)
├── pyproject.toml       # fastapi, uvicorn, httpx, openai, pillow, pillow-heif, pypdfium2,
│                        # pydantic-settings, python-multipart; dev: pytest, pytest-asyncio, respx
├── Dockerfile           # slim python:3.13, uv sync, uvicorn app.main:app
├── README.md            # run locally, env vars, curl example, latency expectations
└── example.env
```

## Config (`config.py`, all env-prefixed `RECEIPT_PARSER_`)
| Env | Default | Meaning |
|---|---|---|
| `RECEIPT_PARSER_API_TOKEN` | — (required) | bearer token clients must send |
| `RECEIPT_PARSER_OPENAI_BASE_URL` | `http://localhost:11434/v1` | any OpenAI-compatible server |
| `RECEIPT_PARSER_OPENAI_API_KEY` | `none` | pass-through (local servers ignore it) |
| `RECEIPT_PARSER_OPENAI_MODEL` | — (required) | e.g. `qwen2.5-vl:7b` |
| `RECEIPT_PARSER_MAX_FILE_MB` | `15` | upload cap → 413 |
| `RECEIPT_PARSER_MAX_PDF_PAGES` | `5` | pages beyond → `PARTIAL_PAGE_FAILURE` warning |
| `RECEIPT_PARSER_TIMEOUT_S` | `120` | upstream LLM timeout |

## Pipeline (`POST /parse`)
1. **Auth dependency**: constant-time compare of bearer token → 401 contract error.
2. **Size check** (Content-Length + actual read) → 413.
3. **Type sniff** by magic bytes (not filename): JPEG/PNG/WEBP → as-is; HEIC → convert to JPEG
   (pillow-heif); PDF → render up to `MAX_PDF_PAGES` pages at ~150 dpi (pypdfium2) to JPEGs;
   anything else → 415.
4. **Downscale** every image so max dimension ≤ 2000 px (Pillow, quality 85) — keeps local
   model latency and context sane.
5. **LLM call** (`llm.py`): one chat-completions request per page image (base64 data URL,
   `detail: high`), system prompt instructing: extract merchant, ISO date, ISO currency, total,
   items[{name, quantity, unit_price, line_total}], per-item confidence 0..1; respond with
   ONLY a JSON object matching the given schema; unknown → null; numbers as strings.
   Parse response as JSON; on parse failure, retry **once** with an appended "Your previous
   output was not valid JSON, output only the JSON object" message; still failing → 502
   `MODEL_ERROR`. Upstream connection error/timeout → 502.
6. **Multi-page merge**: concatenate items in page order; merchant/date/currency from the first
   page that has them; total = last page's total if present else null; add `MULTIPAGE_MERGED`
   warning; a failed page (model error on page ≥ 2) → drop the page + `PARTIAL_PAGE_FAILURE`.
7. **Post-processing**: normalize decimals (`,` → `.`, strip currency symbols); compute
   Σ line_total vs total → `ITEMS_TOTAL_MISMATCH` warning; missing date/currency → their
   warning codes; `status = 'partial'` per contract rules (any confidence < 0.5, empty items,
   or LOW_CONFIDENCE); model saw no receipt (empty items AND no total) → 422
   `UNREADABLE_INPUT`.
8. Response validated through the pydantic contract schemas before returning (guarantees the
   service can never emit off-contract JSON).

`GET /health` → `{status: 'ok', model: settings.openai_model}`, no auth.
Statelessness: no disk writes, no DB; everything in memory per request.

## Docker / compose
- `Dockerfile`: `python:3.13-slim`, install via uv, non-root user,
  `CMD uvicorn app.main:app --host 0.0.0.0 --port 8090`.
- Root `docker-compose.yml`: service `receipt-parser` (DNS-safe name per docker-infra skill),
  `profiles: ["parser"]` so plain `docker-compose up` does not start it; env passthrough;
  healthcheck hitting `/health`. Document in README: `docker compose --profile parser up`.
- Root `example.env`: add the `RECEIPT_PARSER_*` block, commented.

## Tests (mocked LLM — no real model in CI)
Mock strategy: fixture monkeypatches `llm.call_model(image_b64, …) -> dict` (or respx-mocks the
HTTP layer — either, but be consistent).
1. Auth: missing/wrong token → 401 contract body; correct → 200.
2. JPEG happy path: mocked model returns clean payload → contract-valid 200, decimals as
   strings, `status: ok`.
3. Mismatched totals → `ITEMS_TOTAL_MISMATCH` + still 200 `ok`/`partial` per rules;
   low confidence item → `partial` + `LOW_CONFIDENCE`.
4. Model returns junk twice → 502 `MODEL_ERROR`; upstream timeout → 502.
5. Model finds nothing → 422 `UNREADABLE_INPUT`.
6. PDF: 2-page fixture (generate via pypdfium2/reportlab or check in a tiny one) → items merged
   in order + `MULTIPAGE_MERGED`.
7. Unsupported type (txt bytes) → 415; oversize body → 413.
8. Every 200/4xx/5xx body validates against the contract schemas (shared assertion helper).

## Done criteria
- [ ] `pytest` green inside `services/receipt-parser/` (own env, `uv sync`).
- [ ] `docker compose --profile parser up` serves `/health`; core `docker-compose up`
      unaffected without the profile.
- [ ] Provider swap = env-only (README shows an Ollama and an OpenAI-hosted example).
- [ ] Responses can never leave the contract (pydantic-validated out).

## Verification
```bash
cd services/receipt-parser && uv sync && uv run pytest -q
docker compose --profile parser up -d receipt-parser && curl localhost:8090/health
# with a local model configured: curl -H "Authorization: Bearer $TOKEN" -F file=@receipt.jpg localhost:8090/parse
```
