# Deployment

The parser is **not** part of the repo's top-level stack. Two supported
topologies, chosen by where the model runs.

## A. Home server next to a local LLM (default design)

The main stack (Django, React, postgres, redis, celery) runs on a VPS for 24/7
availability; the parser deploys on the home server alongside the LLM, so the
parser→LLM hop and OCR stay local to the GPU box:

```
   VPS (always on)                        home server (intermittent, GPU)
 ┌───────────────────────┐   tailnet    ┌──────────────────────────────────┐
 │ django + celery       │─────────────►│ receipt-parser :8100  ─► LLM     │
 │   PARSER_URL ─────────┼──────────────┤ (docker compose here)  (host)    │
 └───────────────────────┘              └──────────────────────────────────┘
```

**Wiring it up:**

1. Install [Tailscale](https://tailscale.com/) on both hosts (`tailscale up`)
   and note the home server's tailnet IP (`tailscale ip -4`, a `100.x.y.z`
   address).
2. On the home server, set `PARSER_BIND_ADDR` to that IP in `.env` and start
   the stack. The port binds to the tailnet interface only — never `0.0.0.0`,
   which would expose a path toward the LLM. The default (`127.0.0.1`) fails
   safe.
3. On the VPS, set `PARSER_URL=http://100.x.y.z:8100` and `PARSER_API_TOKEN`
   (matching the parser's) in the backend env.

`PARSER_API_TOKEN` stays required as defense-in-depth even on a private mesh.

### Intermittent availability is a normal state

When the home server is off the backend degrades rather than failing:

- `GET /api/transactions/extraction/config` reports `reachable: false` (live
  probe, short-TTL cached), so the UI relabels the "From receipt" affordance as
  offline instead of letting an upload fail.
- Queued attachment extractions stay retryable — the Celery task retries with
  exponential backoff over ~12 hours (tunable via `PARSER_EXTRACT_*` on the
  backend), so receipts uploaded while the home server is down are picked up
  when it returns. A 4xx from `/parse` is *not* retried: that file would be
  rejected identically every time.

If `PARSER_URL` is unset entirely, the backend hides every extraction
affordance — the service is fully optional.

## B. Same VPS as the backend, hosted model (Gemini)

With `PARSER_MODEL_PROVIDER=gemini` there is no local-LLM dependency, so the
parser container can sit on the VPS next to the backend. All pre- and
post-processing (PDF rendering, OCR, grounding) is CPU-only and self-contained
in the image — no GPU, no runtime downloads.

- Add the parser as a service on the backend's Docker network; no host port is
  needed. Point the backend at it: `PARSER_URL=http://<container-name>:8100`.
- Set `PARSER_MODEL_PROVIDER=gemini`, `PARSER_GEMINI_API_KEY`, and a real
  `PARSER_API_TOKEN`.
- `/health` then tracks Gemini reachability, so the backend's offline handling
  effectively never triggers.

Trade-offs: receipt images leave your infrastructure (Google processes them),
and OCR runs on VPS CPU (a few seconds per receipt — fine for the async Celery
flow).

## Choosing a model

Any vision model exposed over an OpenAI-compatible `/chat/completions` works.
For local, self-hosted use, `qwen2.5-vl` (7B) via Ollama is a good starting
point. Smaller 2–3B vision models tend to drop line items and misread
thermal-print digits; larger hosted models score higher on messy photos at
higher cost. Compare candidates on a handful of real receipts before switching.
