# Processing pipeline

What happens to a file between `POST /parse` and the JSON response. The
authoritative wire format is [`../API.md`](../API.md); this document
explains the three stages that produce it.

```
file ──► 1. pre-process (app/images.py, app/ocr.py)
          │    images:     base64 PNGs — PDF pages rasterized; extreme-aspect
          │                photos split into overlapping vertical tiles
          │    transcript: PDF text layer (born-digital) or RapidOCR, or none
          ▼
         2. extract (app/llm.py, app/gemini.py)
          │    images + advisory transcript → model → raw JSON text
          ▼
         3. post-process (app/parser.py)
          │    defensive coercion, derived warnings, transcript grounding
          ▼
         contract JSON (API.md v1)
```

Every stage degrades gracefully: OCR off or broken means vision-only extraction
plus an `ocr_unavailable` warning — never a 5xx.

## 1. Pre-processing

Input validation happens first, before any model cost is incurred:

- Uploads above `PARSER_MAX_FILE_MB` are rejected with `400 file_too_large`
  (the service reads at most limit+1 bytes, so oversized bodies are never
  buffered).
- Content types other than JPEG, PNG, WebP, HEIC/HEIF, and PDF are rejected
  with `400 unsupported_media_type`.
- Undecodable files (corrupt image, broken PDF) are rejected with
  `422 unreadable_input`.

Then the upload is decoded into **model-ready images** plus an optional
**machine-extracted transcript**:

**Photos** (JPEG/PNG/WebP/HEIC) are decoded with Pillow (HEIC via pillow-heif)
and re-encoded as PNG. Very long receipt photos — height over 2.5× width and
over 2000 px — are split into overlapping vertical tiles (~15% overlap) so
vision encoders don't downscale them into illegibility; the prompt tells the
model not to duplicate items from the overlap. OCR always runs on the whole,
untiled image (one pass, no seam duplicates).

**PDFs** are rasterized page by page with pypdfium2 at
`PARSER_PDF_RENDER_SCALE` (~144 DPI at the default 2.0). Only the first
`PARSER_PDF_MAX_PAGES` pages are processed; extra pages are dropped and a
`multi_page_merged` warning is added.

**The transcript** is the machine-read text of the receipt, used both as a hint
to the model and as the fact-checker in stage 3:

- A born-digital PDF (more than ~80 extracted characters per page) supplies its
  embedded text layer — exact digits, no OCR needed.
- Photos and scanned PDFs are transcribed with RapidOCR (PaddleOCR models on
  ONNX Runtime, CPU only, models baked into the Docker image — no runtime
  egress). Detected words are regrouped into lines by y-center proximity and
  sorted by x, preserving the "name …… price" row structure.
- If OCR is disabled (`PARSER_OCR_ENABLED=false`), fails, or detects nothing,
  the transcript is absent: extraction proceeds vision-only and the response
  carries an `ocr_unavailable` warning.

## 2. Extraction

The images and the transcript (truncated to `PARSER_TRANSCRIPT_MAX_CHARS`,
framed as "machine-extracted: digits reliable, layout imperfect") go to the
configured model backend. Both backends share the same system prompt and return
raw JSON text; nothing downstream differs.

- **`openai`** (default) — any OpenAI-compatible vision `/chat/completions`
  endpoint: local runtimes (llama.cpp, Ollama, vLLM) or hosted providers.
  Decoding is schema-constrained (`json_schema`); an endpoint that rejects it
  with a 4xx is remembered and gets plain `json_object` for the rest of the
  process. An HTTP 200 with empty content (a thinking model that ran out of
  tokens before answering) maps to `503 model_unavailable`, never a bare 500.
- **`gemini`** — the Google Gemini REST API, no SDK. Uses plain JSON mode
  *without* `responseSchema`, on measured evidence (gemini-3.1-flash-lite,
  2026-07): constrained decoding forced schema-ordered keys and scrambled
  fields into `warnings`, and fixing that with `propertyOrdering` triggered a
  ~30× output-token whitespace runaway. The prompt carries the shape and
  stage 3 re-validates everything regardless.

## 3. Post-processing

The model's JSON is treated as untrusted. `normalize()` in `app/parser.py`
rebuilds the response field by field:

- **Coercion** — every money value becomes a 2-decimal string (never a float);
  malformed rows are skipped, never raised on; confidence values are clamped to
  0..1; missing quantity defaults to `"1"`.
- **Derived warnings** — computed here, never trusted from the model:
  `item_math_mismatch` (a row where quantity × unit_price ≠ line_total),
  `total_mismatch` (Σ line totals ≠ total), `total_missing`,
  `multi_page_merged`, `ocr_unavailable`.
- **Transcript grounding** — the deterministic fact-check, when a transcript
  exists. Every money-shaped token is harvested from the transcript
  (`4,49`, `1 234.56`, … → canonical `"4.49"`). Then:
  - the model's `total` found among those tokens ⇒ `confidence.total` floored
    at **0.9**; not found ⇒ `total_not_in_source` warning and `confidence.total`
    capped at **0.5**;
  - ≥ 80% of item `line_total`s found ⇒ `confidence.items` floored at 0.9;
    < 50% found ⇒ capped at 0.5.

  The parser never "corrects" a number — it reports what the model read and
  flags what the paper can't confirm. Without a transcript, confidence passes
  through unchanged (the model's own estimate).

## 4. Response structure

Success is `200` with the contract shape:

```json
{
  "schema_version": "1",
  "merchant": "Lidl sp. z o.o.",          // string | null
  "date": "2026-06-14",                   // YYYY-MM-DD | null
  "currency": "PLN",                      // ISO 4217 | null
  "total": "42.97",                       // decimal string | null — never a float
  "items": [
    {"name": "Chleb wiejski 500g", "quantity": "1",
     "unit_price": "4.49", "line_total": "4.49", "confidence": 0.98}
  ],
  "confidence": {"merchant": 0.92, "date": 0.97, "currency": 0.99,
                 "total": 0.98, "items": 0.95},   // 0..1 per field
  "warnings": []                          // see API.md for all codes
}
```

Consumers should treat confidence `< 0.7` (and every warning) as "flag for
human review", and must never parse money strings to float.

Foreseeable failures return `4xx`/`503` with a structured error body — never a
bare 500:

```json
{"schema_version": "1", "error": {"code": "unreadable_input", "message": "…"}}
```

| HTTP | `error.code` | meaning |
|------|--------------|---------|
| 400 | `unsupported_media_type` | Not JPEG/PNG/WebP/HEIC/PDF. |
| 400 | `file_too_large` | Above the configured size cap. |
| 401 | `unauthorized` | Missing/invalid bearer token. |
| 422 | `unreadable_input` | Decodable file, but no receipt content extractable. |
| 503 | `model_unavailable` | The configured model provider is unreachable/erroring. |

Full field semantics, warning codes, and worked examples:
[`../API.md`](../API.md).
