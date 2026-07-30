# P1 — Receipt parser contract (schema v1)

Size **S** · Deps: none · Plan: `IMPLEMENTATION_PLAN.md` · Roadmap §6

## Objective
Write `services/receipt-parser/API.md` — the frozen, versioned JSON contract between the
receipt parser service (P2) and Denarly (R5). Denarly codes against this document, not against
the service implementation. The contract below is the design; the task is to write it out with
full examples and field documentation.

## The contract (v1)

### Request
`POST /parse` — `multipart/form-data`, field `file`: one of JPEG, PNG, HEIC, WEBP, PDF.
Header `Authorization: Bearer <token>`. No other parameters in v1.

### Response — HTTP 200 (parse attempted)
```json
{
  "schema_version": "1.0",
  "status": "ok",                          // "ok" | "partial"
  "merchant": "Biedronka",                 // string | null
  "date": "2026-07-04",                    // ISO date | null
  "currency": "PLN",                       // ISO 4217 guess | null
  "total": "51.20",                        // decimal AS STRING | null
  "items": [
    {
      "name": "Mleko 3.2% 1L",
      "quantity": "2",                     // decimal string (weights: "0.454")
      "unit_price": "3.99",                // decimal string | null
      "line_total": "7.98",                // decimal string
      "confidence": 0.93                   // 0..1 float
    }
  ],
  "warnings": [
    { "code": "ITEMS_TOTAL_MISMATCH",
      "message": "Sum of line totals (49.20) differs from detected total (51.20)",
      "field": "total" }                   // field: string | null
  ]
}
```
Rules:
- **All monetary/quantity values are decimal strings**, never floats (Denarly stores Decimals).
- `status: "partial"` when a total or items were found but the extraction is incomplete or
  low-confidence (any item `confidence < 0.5`, or warnings of code `LOW_CONFIDENCE`).
- `items` may be empty with `status: "partial"` (e.g. total found, items unreadable).
- Warning codes (closed enum, extend only with a version bump):
  `LOW_CONFIDENCE`, `ITEMS_TOTAL_MISMATCH`, `DATE_NOT_FOUND`, `CURRENCY_NOT_FOUND`,
  `MULTIPAGE_MERGED`, `PARTIAL_PAGE_FAILURE`.

### Response — errors (structured, never a bare 500)
| HTTP | code | when |
|---|---|---|
| 401 | `UNAUTHORIZED` | missing/wrong bearer token |
| 413 | `FILE_TOO_LARGE` | over configured size cap |
| 415 | `UNSUPPORTED_FORMAT` | not an accepted content type |
| 422 | `UNREADABLE_INPUT` | decodable file, but the model found no receipt content |
| 502 | `MODEL_ERROR` | upstream LLM unreachable/invalid output after retry |

Error body: `{ "schema_version": "1.0", "status": "error",
"error": { "code": "UNREADABLE_INPUT", "message": "…" } }`

### Health
`GET /health` → `{ "status": "ok", "model": "<configured model id>" }` (no auth).

### Versioning
`schema_version` uses semver-lite: additive optional fields bump the minor ("1.1");
breaking changes bump major and the doc keeps both sections until Denarly migrates.

## What to write in API.md
1. The request/response spec above, with every field documented (type, nullability, meaning).
2. **Three complete worked examples**: (a) clean grocery receipt (several items, quantities incl.
   a weight, total matches); (b) partial extraction (blurry photo: total + 2 of ~10 items,
   `LOW_CONFIDENCE` + `ITEMS_TOTAL_MISMATCH` warnings, `status: "partial"`); (c) error
   (`UNREADABLE_INPUT` 422 body).
3. A short "client guidance" section for R5: treat `partial` as "open review UI with warnings
   flagged"; decimals are strings; unknown warning codes must be tolerated (forward-compat).
4. Latency note: synchronous endpoint, local models may take 10–60 s — callers must use generous
   timeouts and call from a background worker (Denarly: Celery).

## Done criteria
- [ ] `services/receipt-parser/API.md` exists with the spec + 3 examples + client guidance.
- [ ] Every example is valid against the field rules (self-consistent decimal strings, enums).
- [ ] No implementation details of the service leak into the contract (model names, prompts).
