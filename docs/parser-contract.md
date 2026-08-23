# Receipt Parser Contract - v1

This document is the canonical, versioned specification of the receipt parser
contract. A receipt parser is a stateless HTTP service: one file in (a photo or scan
of a receipt), one JSON document out, nothing persisted between requests. It has two
audiences: implementers building a compliant parser, and consumers calling one.
Denarly - the project publishing this specification - is the reference consumer: its
backend speaks this contract, and any service that implements it can act as a
Denarly parser by pointing the backend's `PARSER_URL` setting at the service.

This specification documents WHAT a compliant service does: endpoints,
authentication, request and response shapes, field semantics, and warning and error
codes. It never prescribes HOW a result is achieved - there are no requirements
regarding models, providers, prompts, or internal pipelines.

## Versioning

This document is frozen at v1. Any change to the contract requires a new version of
this document, and earlier versions remain as sections until consumers have
migrated:

- **Minor bump (v1.1)** for additive, backward-compatible changes: new optional
  response fields, new warning codes. `schema_version` stays `"1"` across the v1
  line, because consumers must ignore unknown keys and codes.
- **Major bump (v2)** for breaking changes: removed or renamed fields, changed
  types or semantics. `schema_version` becomes `"2"`, and the v1 section stays in
  this document until all consumers have migrated.

While v1 is in force, every response carries `"schema_version": "1"`.

## Endpoints

### POST /parse

```
POST /parse
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

The request body is `multipart/form-data` with a single field:

| field | type | required | notes |
|-------|------|----------|-------|
| `file` | binary | yes | JPEG, PNG, WebP, HEIC, or PDF. A size cap is enforced by the service; a larger upload is rejected with `400 file_too_large`. |

Authentication: every `/parse` request carries `Authorization: Bearer <token>`. The
token is a static shared secret configured by the operator of the service; a missing
or invalid token is rejected with `401 unauthorized`. Denarly sends its configured
`PARSER_API_TOKEN` as this bearer token.

A parse call is not expected to be fast - it may take tens of seconds. Consumers
should use generous timeouts and call the parser from a background worker rather
than a user-facing request.

### GET /health

Returns `200 {"status": "ok", "model": "<configured model id>"}` when the service
can serve `/parse` requests right now, and `503` with the error shape (below)
otherwise. The `model` value is an opaque identifier configured by the operator; it
carries no interoperability meaning.

## Success response - `200`

```json
{
  "schema_version": "1",
  "merchant": "Biedronka 4381",
  "date": "2026-06-28",
  "currency": "PLN",
  "total": "87.43",
  "items": [
    {
      "name": "Mleko UHT 3.2% 1L",
      "quantity": "2",
      "unit_price": "3.99",
      "line_total": "7.98",
      "confidence": 0.97
    }
  ],
  "confidence": {
    "merchant": 0.88,
    "date": 0.95,
    "currency": 0.99,
    "total": 0.97,
    "items": 0.91
  },
  "warnings": []
}
```

### Field semantics

- **`schema_version`** - always the string `"1"` for this contract.
- **`merchant`** - string or `null`. Best-effort merchant name as printed.
- **`date`** - ISO `YYYY-MM-DD` string or `null`. The purchase date, never the print
  date if both appear.
- **`currency`** - ISO 4217 alphabetic code (uppercase) or `null`. Inferred from
  symbols/locale when not printed; when inferred, a `currency_inferred` warning is
  added.
- **`total`** - decimal **string** or `null`. The grand total actually paid (after
  discounts, including tax). Never a float - all monetary values are decimal strings
  to avoid binary-float drift.
- **`items[]`** - possibly empty, in printed order:
  - `name` - string, as printed (no translation).
  - `quantity` - decimal string, `"1"` when not printed.
  - `unit_price` - decimal string or `null`.
  - `line_total` - decimal string or `null`. When both `quantity` and `unit_price`
    are present, `line_total` should equal their product; the parser reports what is
    printed and does not correct arithmetic (mismatches get an `item_math_mismatch`
    warning instead).
  - `confidence` - float 0..1 for this row as a whole.
- **`confidence`** - per-field floats 0..1. A field that is `null` has confidence
  `0.0`. Consumers should treat `< 0.7` as "flag for human review".
- **`warnings[]`** - zero or more of the codes below. Unknown codes must be ignored
  by consumers (forward compatibility).

### Warning codes

| code | meaning |
|------|---------|
| `currency_inferred` | Currency not printed; inferred from symbol or locale. |
| `total_missing` | No grand total found; `total` is `null`. |
| `total_mismatch` | `line_total` differs from `total` by more than 0.01. |
| `item_math_mismatch` | Some row's `quantity × unit_price ≠ line_total`. |
| `partially_readable` | Part of the receipt was unreadable; items may be missing. |
| `multi_page_merged` | Input was a multi-page PDF; pages were merged into one result. |
| `discount_lines_folded` | Discount/deposit lines were folded into adjacent items. |
| `total_not_in_source` | `total` was not found among the money tokens of the machine-extracted transcript (PDF text layer or OCR); `confidence.total` is capped at 0.5. |
| `ocr_unavailable` | OCR could not ground this input (disabled, failing, or no detections); the result is vision-only, without transcript grounding. |

Unknown codes must be ignored by consumers (forward compatibility). Implementers may
add new warning codes only with a minor version bump of this contract.

## Confidence grounding (informative)

This section is informative: it records observable behavior, not requirements.

How an implementation produces its confidence values is out of scope for this
contract - the implementer may ground them however it chooses (transcript
cross-checks, calibration, fixed values, or anything else). Two warning codes
document the observable grounding behavior of the v1 reference parser:

- `total_not_in_source` - the total was not found among the money tokens of a
  machine-extracted transcript (PDF text layer or OCR); `confidence.total` is
  capped at 0.5.
- `ocr_unavailable` - no transcript grounding was possible for this input; the
  result is vision-only.

Implementers are free to emit or not emit these codes; consumers must handle both
like any other warning.

## Error response

Errors the caller can act on are returned with HTTP `4xx`/`503` and this body - the
service never returns a bare `500` for foreseeable conditions:

```json
{
  "schema_version": "1",
  "error": {
    "code": "unreadable_input",
    "message": "The image is too blurry to extract any fields."
  }
}
```

| HTTP | `error.code` | meaning |
|------|--------------|---------|
| 400 | `unsupported_media_type` | Not JPEG/PNG/WebP/HEIC/PDF. |
| 400 | `file_too_large` | Above the configured size cap. |
| 401 | `unauthorized` | Missing/invalid bearer token. |
| 422 | `unreadable_input` | Decodable file, but no receipt content extractable. |
| 503 | `model_unavailable` | The configured model provider is unreachable/erroring. |

`unreadable_input` is an error, not a success-with-empty-items: an empty `items`
array on `200` means "a readable receipt with no line items detected", which callers
may still accept.

## Worked examples

### 1. Typical grocery receipt (PLN)

```json
{
  "schema_version": "1",
  "merchant": "Lidl sp. z o.o. Warszawa",
  "date": "2026-06-14",
  "currency": "PLN",
  "total": "42.97",
  "items": [
    {"name": "Chleb wiejski 500g", "quantity": "1", "unit_price": "4.49", "line_total": "4.49", "confidence": 0.98},
    {"name": "Masło ekstra 200g", "quantity": "2", "unit_price": "7.99", "line_total": "15.98", "confidence": 0.96},
    {"name": "Pomidory luz", "quantity": "0.782", "unit_price": "9.99", "line_total": "7.81", "confidence": 0.93},
    {"name": "Ser Gouda plastry", "quantity": "1", "unit_price": "14.69", "line_total": "14.69", "confidence": 0.97}
  ],
  "confidence": {"merchant": 0.92, "date": 0.97, "currency": 0.99, "total": 0.98, "items": 0.95},
  "warnings": []
}
```

### 2. Partial read - crumpled thermal paper, total readable

```json
{
  "schema_version": "1",
  "merchant": null,
  "date": "2026-05-02",
  "currency": "EUR",
  "total": "23.10",
  "items": [
    {"name": "Espresso doppio", "quantity": "2", "unit_price": "3.20", "line_total": "6.40", "confidence": 0.81}
  ],
  "confidence": {"merchant": 0.0, "date": 0.74, "currency": 0.85, "total": 0.9, "items": 0.55},
  "warnings": ["partially_readable", "total_mismatch", "currency_inferred"]
}
```

A consumer should surface the low `items` confidence and the `total_mismatch`
(6.40 ≠ 23.10 - rows are missing) on its review screen.

### 3. Unreadable input

```
HTTP/1.1 422 Unprocessable Entity
```

```json
{
  "schema_version": "1",
  "error": {
    "code": "unreadable_input",
    "message": "No receipt-like content detected; the image appears to be a photo of a desk."
  }
}
```

## Consumer obligations

Any consumer of a parser service - the Denarly backend is one - must:

- Treat all monetary values as decimal strings; never parse to float.
- Ignore unknown top-level keys and unknown warning codes.
- Show per-field review UI for any confidence `< 0.7` and for every warning.
- Never auto-commit a parsed result without user confirmation.
