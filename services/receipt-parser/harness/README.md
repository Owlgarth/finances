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
| _run `score.py` to fill in_ | | | | | | |
