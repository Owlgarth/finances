# Self-Hosting Guide

This guide covers running Owlgarth Finances from the published release images
(`ghcr.io/owlgarth/finances-backend`, `ghcr.io/owlgarth/finances-ui`) with the
compose file in [`prod/`](../prod/docker-compose.yml). For local development
see [Quick Start](../README.md#quick-start).

One caveat up front: the stack ships no TLS termination and no domain routing.
That layer is deliberately deferred (see
[TLS and the reverse proxy](#tls-and-the-reverse-proxy-deferred)); on a LAN or
VPN the quick start below is the whole story, and a public HTTPS deployment
fronts the stack with your own reverse proxy.

## Prerequisites

- Docker and Docker Compose (v2 - `docker compose`, with a space).
- A published release tag: `APP_VERSION` must name a `vX.Y.Z` tag that exists
  on the GHCR packages
  ([finances-backend](https://github.com/Owlgarth/finances/pkgs/container/finances-backend),
  [finances-ui](https://github.com/Owlgarth/finances/pkgs/container/finances-ui)).
  Tags are cut by the release pipeline and both amd64 and arm64 images are
  published per tag (see [Releasing](workflow.md#releasing)).
- A clone of this repository: the compose file and the `.env` template live
  in `prod/`.

## Quick start

```bash
git clone https://github.com/Owlgarth/finances.git
cd finances/prod
cp .env.example .env   # .env is gitignored (*.env); real secrets live here
# edit .env: replace every change-me-* secret, pin APP_VERSION to a published tag
docker compose up -d
docker compose ps      # 7 long-running services; storage-init chowns once and exits 0
```

Open `http://<server-host>:80` (or the port you set in `UI_PORT`) and register
the first account - it becomes the owner of a workspace with starter fixtures
(see [Starter & Demo Fixtures](../backend/README.md#starter--demo-fixtures)).

On every boot the backend entrypoint migrates the database, seeds the currency
catalog and legal documents, creates the storage buckets, collects static
files and compiles translations - each step idempotent, so restarts and
upgrades are safe. The one-shot `storage-init` service exists only to fix
storage-volume ownership on first start and needs no attention.

## Configuration

The complete template with inline comments is
[`prod/.env.example`](../prod/.env.example); this section is the highlights.

### Secrets

Five placeholders must change before any real use: `SECRET_KEY` and
`JWT_SECRET_KEY` (two different random 64-character strings),
`POSTGRES_PASSWORD`, `S3_ACCESS_KEY` and `S3_SECRET_KEY`.

### Origins that must match the real deployment

`ALLOWED_HOSTS` (the names the API answers on), `CORS_ALLOWED_ORIGINS` (the
exact origin the UI is served from, scheme included) and `FRONTEND_URL` (the
frontend origin the backend uses when building links back to the UI, for
example in emails) are placeholders for the project's own domain. They must
match where browsers actually reach your deployment - a mismatch surfaces as
CORS errors or rejected requests, not as a clear configuration warning.

### Email

Leave `EMAIL_HOST` empty and the backend prints emails to the `api` container
logs - fine for a first look, but account verification needs a real relay:
fill `EMAIL_HOST`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` (ports and TLS
flags are in the template).

### Legal documents (GDPR)

`LEGAL_OPERATOR_NAME`, `LEGAL_OPERATOR_TYPE`, `LEGAL_CONTACT_EMAIL`,
`LEGAL_CONTACT_ADDRESS`, `LEGAL_JURISDICTION` feed the seeded privacy policy
and terms of service; see [GDPR Compliance](../README.md#gdpr-compliance).

### Everything else

`API_PORT` and `UI_PORT` are the only published host ports; `DEMO_MODE` stays
`false` on a private instance (true disables registration); the remaining
database/Redis/storage values point at compose service names and need no
changes.

## The ui image and VITE_API_URL

`VITE_API_URL` is a build-time value: CI bakes it into the JavaScript bundle
when the `finances-ui` image is built. Published images are built with the
default `https://finances.owlgarth.com/api` (a repository variable can
override it at build time; see [Releasing](workflow.md#releasing)). Setting it
in `prod/.env` changes nothing - the `ui` service has no `env_file`; nothing
in that image reads runtime environment.

If your API is not reachable at the URL baked into the image, the SPA silently
calls the wrong backend - check the browser's network tab before suspecting
your `ALLOWED_HOSTS` or CORS setup.

For a different API URL, build your own ui image via
`prod/docker-compose.override.yml` (compose loads it automatically):

```yaml
services:
  ui:
    image: my-finances-ui   # local tag, replaces the GHCR image for this service
    build:
      context: ../frontend
      additional_contexts:
        backend: ../backend  # the build imports shared registries from backend/
      args:
        VITE_API_URL: https://finances.example.com/api
        VITE_DEMO_MODE: "false"
        VITE_APP_VERSION: "0.1.0"
```

then `docker compose up -d --build`.

These are the same three build args the release pipeline passes; build args
are public metadata (they land in image history), so URLs and flags only -
never secrets.

## The browser reaches the API directly

The ui image's nginx serves the static SPA and nothing else - there is no
`/api` proxy in that image - so the browser talks to the backend directly on
`API_PORT`. Whatever route a browser takes to reach `UI_PORT` and `API_PORT`
(host, scheme, port) must be consistent with `CORS_ALLOWED_ORIGINS` and
`ALLOWED_HOSTS`, and a reverse proxy must expose both separately (see
[TLS and the reverse proxy](#tls-and-the-reverse-proxy-deferred)).

In development the Vite dev server proxies nothing either - the
direct-browser posture is the same as production.

## Storage and S3_EXTERNAL_URL

Two URLs, two audiences (see [Deployment](architecture.md#deployment)):
`S3_ENDPOINT_URL` (`http://storage:9000`) is what the backend uses
server-side inside the compose network - never change it; `S3_EXTERNAL_URL`
is what gets rendered into browser-facing URLs (Django admin static files,
receipt-attachment links).

The prod compose publishes no host port for storage. Until you front storage
with your reverse proxy - or publish a port yourself in an override file -
browser-facing storage URLs point at a host the browser cannot reach: the SPA
itself works, but the Django admin loads unstyled and receipt attachments do
not open.

The scheme matters: an `http://` `S3_EXTERNAL_URL` on an HTTPS page is blocked
by the browser as mixed content. Changing `S3_EXTERNAL_URL` needs only a
restart of the backend services - no re-collectstatic
([Deployment](architecture.md#deployment) has the details).

## Optional receipt parser

Extraction is pluggable: any service implementing the
[Parser Contract](parser-contract.md) works. Point the backend at yours with
`PARSER_URL` in `prod/.env`; leave it empty and the backend reports extraction
as disabled and the UI hides every extraction affordance.

The remaining client knobs (`PARSER_API_TOKEN`, timeouts, retries) are
dev-template variables: their defaults live in `backend/config/settings.py`,
and the full list is documented in the root `example.env`.

## Backups

The durable state lives in two named volumes: `db-data` (PostgreSQL - all
business data) and `storage-data` (receipt attachments and collected static
files). `redis-data` holds Celery broker/result state only - losing it loses
no business data.

Run the examples from `prod/`; the compose project name is the directory, so
the volumes are `prod_db-data` / `prod_storage-data` (check with
`docker volume ls`):

```bash
docker compose exec db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup-$(date +%F).sql
docker run --rm -v prod_storage-data:/data -v "$PWD":/backup \
  busybox tar czf /backup/storage-$(date +%F).tgz -C /data .
```

Test the restore path before you need it - an untested backup is an
assumption, not a recovery plan.

## Upgrades

```bash
# edit prod/.env: APP_VERSION=vX.Y.Z (the newer published tag)
docker compose pull
docker compose up -d
```

The boot-time entrypoint applies migrations idempotently, so an upgrade is:
pin the new tag, pull, restart. How tags are produced and what a `vX.Y.Z` tag
guarantees (test gate, dual-arch images) is in
[Releasing](workflow.md#releasing).

## TLS and the reverse proxy (deferred)

Nothing in this stack terminates TLS or routes domains - that layer is
deliberately deferred. On a LAN or VPN the quick start is the whole story.
For a public HTTPS deployment, front three targets with your own reverse
proxy: the `ui` container (the SPA on `UI_PORT`), the `api` container (the
browser calls it directly - there is no `/api` proxy to collapse the two onto
one host), and the `storage` container (so `S3_EXTERNAL_URL` resolves in
browsers). With the proxy in place, set `ALLOWED_HOSTS`,
`CORS_ALLOWED_ORIGINS`, `FRONTEND_URL` and `S3_EXTERNAL_URL` to the real
public URLs, and build your own ui image if the public API URL differs from
the baked `VITE_API_URL` (see
[The ui image and VITE_API_URL](#the-ui-image-and-vite_api_url)). Behind a
proxy, the backend's client-IP parsing expects `TRUSTED_PROXY_COUNT`
(documented in the environment table in
[Architecture](architecture.md#environment-configuration)); it is not in
`prod/.env.example` - add it to your `.env` when your proxy chain is nonzero.
Backups, monitoring and a deploy runbook remain yours to own; this guide
documents the mechanics, not an opinionated hardening checklist.
