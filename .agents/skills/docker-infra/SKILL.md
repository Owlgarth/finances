---
name: docker-infra
description: Docker, nginx, and S3-compatible storage conventions for Owlgarth Finances - DNS-safe service names, nginx header inheritance, entrypoint consistency, dual S3 URLs, bucket policies, init ordering, third-party image tag+digest pinning, Dockerfile ARG hygiene. Use when editing docker-compose.yml, Dockerfiles, entrypoint scripts, nginx config, storage/S3 configuration, or the dev.sh release command.
---

# Docker & Infrastructure

## DNS-Safe Service Names

Service names are the hostnames on the compose network, so keep them short and DNS-safe (hyphens, never underscores): `db`, `redis`, `storage`, `api`, `ui`, `worker`, `beat`. botocore, strict URL validators, and RFC 952/1123 reject underscores in hostnames — `ValueError: Invalid endpoint` crashes at runtime.

```
POSTGRES_HOST=db
REDIS_URL=redis://redis:6379
S3_ENDPOINT_URL=http://storage:9000
```

## Configuration Lives in .env

`docker-compose.yml` holds no literal configuration — every credential, hostname and published port is interpolated from `.env` (template: `example.env`). Backend services take the whole file via `env_file`; third-party images (`db`, `storage`) get an explicit `environment:` map so one variable feeds both sides (`RUSTFS_ACCESS_KEY: ${S3_ACCESS_KEY}`) and can't drift.

Published ports are `${DB_PORT}:5432`-style so a second checkout, or a shared Postgres/Redis on the host, can run alongside without editing the compose file. A port shift for a second checkout is a TRIPLE, not a one-variable edit: `VITE_API_URL`, `CORS_ALLOWED_ORIGINS`, and `FRONTEND_URL` hardcode the API/UI origins and do NOT derive from `API_PORT`/`UI_PORT` - shifting only the port variables silently points the frontend at the other checkout's backend (or makes CORS reject it), which costs a debugging cycle before anyone suspects the env. Shared setup (build context, `env_file`, volumes, `depends_on`) lives in an `x-backend` anchor at the top of the file.

## Env De-duplication: Map-Form `x-*` Anchors

When several services share an identical `environment:` subset, hoist it into a root-level extension field in **map syntax** and merge it in — list-form `environment:` (`- KEY=VAL`) has no anchor/merge mechanism, so converting the merged blocks to map form is part of the change:

```yaml
x-backend-shared-env: &backend-shared-env
  USE_S3_STORAGE: "true"
  S3_ACCESS_KEY: ${S3_ACCESS_KEY}

services:
  api:
    environment:
      <<: *backend-shared-env
      ALLOWED_HOSTS: '*'
```

- Compose treats top-level `x-*` keys as opaque pass-through — the anchor block never becomes a container. Move explanatory comments onto the anchor so the *why* lives with the values.
- Only merge where the shared vars genuinely match in kind — forcing an anchor onto a service that never had those vars injects them (and `environment:` wins over `env_file`, so it would also shadow `.env` values).
- Map-form quoting: quote `true`/`false`/numbers to document intent, and `*`-valued keys MUST be quoted (`ALLOWED_HOSTS: '*'` — a bare `*` is the YAML alias indicator). Rule of thumb: quote any value that is a bool/null/number or starts with `*`/`&`/`!`/`|`/`>`/`{`/`[`.

**Verification gate - `docker compose config` rendered diff, never `up`:** capture `docker compose config` before and after the edit and diff the two. `config` normalizes list- and map-form `environment:` into the same sorted-map rendering, so a correct de-dup shows exactly one hunk - the rendered `x-*` block itself - and zero service-level changes; any moved env line means a corrupted value. (`up` is never a verification tool in this stack: services bind shared host ports and images do slow boot work.) Two more edges for any count-based gate over rendered output: top-level `x-*` extension fields render verbatim in addition to every service that merges them, so anchor-block copies inflate counts (this is why `restart: unless-stopped` sits on `api`/`worker`/`beat` individually in `prod/` rather than the shared anchor - inside the anchor it renders an extra time and a 7-policy gate counts 8); and `config` renders interpolated secrets in cleartext, so before/after captures stay under /tmp/opencode, never in the repo.

## Third-Party Image Pins: Tag+Digest, Resolved at Edit Time

Third-party service images are pinned `tag@sha256:...`. Digests are moving targets - resolve them at implementation time, never carry one from a plan snapshot or an older checkout. Pin the manifest-LIST digest: the top-level `Digest:` field of `docker buildx imagetools inspect` (MediaType `...image.index`), not a per-platform digest, and require both amd64 and arm64 in the list before pinning.

When an image has no stable semver tags, pin the newest prerelease/RC tag whose digest differs from `latest`'s - the tag is the semantic choice and a digest on `latest` carries no version signal (rustfs: 131 tags, all prerelease, pinned `1.0.0-rc.4`).

`prod/` copies third-party pins verbatim from the dev compose - never re-resolve them independently; Renovate keeps both files in sync.

## Dockerfile ARG Hygiene

ARG values land in image history and in public CI logs - only public values (versions, build flags) go in ARG/ENV, and each new ARG/ENV pair carries a one-line rationale comment saying so. Version ARGs (`APP_VERSION`, `VITE_APP_VERSION`) default to `dev` so plain compose builds need no build-arg changes; the release pipeline passes the real version, and the frontend value is builder-stage only (baked into the JS bundle, absent from the final nginx image). COPY --from tool images (`ghcr.io/astral-sh/uv:*`) pin an exact upstream release tag, re-resolved at edit time - with a lockfile-compat pre-flight when the tool reads the lock (`uv lock --check` under the new version) before editing.

## Dev Script

`./dev.sh` at the repo root is the only one — bash, not POSIX `sh` (`pipefail`, `read -rp`, `local`). Keep new commands in it rather than adding scripts, and keep its `usage()` heredoc in sync.

- `up` — `db redis storage`; `up --full` adds `api ui worker beat`; `up <svc...>` passes through
- `backend` / `frontend` — start the app; `logs`, `manage`, `migrate`, `seed`, `psql`, `test`, `lint`, `npm`
- `release <version>` - fail-closed release pipeline (see below)
- helpers: `load_env`, `use_local_hosts`, `require_service`, `on_host`, `in_service`

It `source`s `.env`, so **values containing spaces must be quoted there** — compose parses that file itself and doesn't care, bash does.

### The `release` command

`./dev.sh release 0.1.0` (bare version; the script adds the `v`) is a fail-closed, ordered pipeline: git-state checks → test gate → VERSION bump → changelog → remote sync → stage → commit → tag → push. Preserve the ordering and its irreversibility guards: VERSION is re-read after write, tag absence is re-verified immediately before `git tag`, and staging is always an explicit literal file list. Git-state checks (branch, clean tree) are fatal in real runs but report-only under `--dry-run` so a dry run works from any checkout; the local gate invokes `./dev.sh lint` / `./dev.sh test` as child processes rather than refactoring the case arms.

### DEV_TARGET: container or host

`DEV_TARGET=docker` (the default, from `.env`) runs backend/frontend commands in the `api` and `node` containers, so no Python/uv/Node is needed on the machine — the case a PyCharm remote interpreter targets. `DEV_TARGET=host` runs them through `uv`/`npm` locally and is the only path that needs `use_local_hosts`.

`in_service` execs into the service when it is up and uses `docker compose run --rm --entrypoint ''` otherwise (the image entrypoint would migrate and collectstatic). Both pass `--user "$(id -u):$(id -g)" -e HOME=/tmp`: **without the uid mapping every file the command writes into the bind mount — new migrations, `.pytest_cache`, `.ruff_cache` — lands root-owned in the checkout**, and without `HOME` uv/npm fail trying to write `/.cache`.

Backend commands resolve through `/venv/bin/<tool>` (`UV_PROJECT_ENVIRONMENT`), not `uv run`, which would try to sync the environment it cannot write.

The `node` service (profile `tools`) exists only for this: `node:22-slim` with `./frontend` bind-mounted. Debian-based like the builder stage, so the `node_modules` it writes stays usable if the host also runs npm — an alpine/musl image would install incompatible esbuild binaries.

`use_local_hosts` exists because the same `.env` serves both worlds: inside compose a service is reached by name (`db`, `redis:6379`), from a host process only through the published port (`localhost:$DB_PORT`). Anything host-run must go through it, or it silently tries to resolve `db`.

## Nothing Container-Owned Inside the Bind Mount

The backend containers run as root against a bind-mounted, host-owned source tree, so any path a named volume mounts *inside* `/app` gets created on the host as a root-owned directory — which then blocks the host toolchain (`uv` can't write `backend/.venv`, `npm` can't write `frontend/node_modules`). Keep generated artefacts outside the mount:

- `UV_PROJECT_ENVIRONMENT=/venv` in the backend image, volume mounted at `/venv`
- Celery beat gets `--schedule=/tmp/celerybeat-schedule`
- The `ui` service is the nginx production build (no bind mount, no `node_modules` volume); frontend hot reload comes from `start-dev-frontend.sh` on the host

Compose otherwise builds **one image per service** from the same Dockerfile, so `docker compose build api` would leave `worker`/`beat` on the old image — which is how a stale worker once recreated a root-owned `/app/.venv`. `api`, `worker` and `beat` therefore share one tag via the anchor:

```yaml
x-backend: &backend
  build: ./backend
  image: ${COMPOSE_PROJECT_NAME}-backend
```

Compose interpolates `COMPOSE_PROJECT_NAME` from the derived project name (the directory), so sibling checkouts keep separate images. Any new service built from `backend/` must use the anchor, never a bare `build:`.

Tooling config must not rely on `.gitignore` for exclusions: `/app` in the container isn't a git checkout. Ruff uses `extend-exclude` so its built-in `.venv` exclusion survives.

## nginx Header Inheritance

nginx does NOT inherit parent-context `add_header` directives into child blocks that define their own `add_header`. Security headers (CSP, HSTS, X-Frame-Options, etc.) must be repeated in each `location` block that has its own `add_header` — e.g., `location = /index.html` and the static-assets regex location. Critical for SPAs where `try_files` internally redirects to `/index.html`.

## One Entrypoint, Overridden Commands

`api` keeps the image `ENTRYPOINT` (`docker-entrypoint.sh`: migrate → seed → bucket init → collectstatic) and only overrides `command` to add `--reload`. Never inline a copy of that script in `docker-compose.yml` — the copy silently drifts (it used to skip `seed_currencies`). Celery services override `entrypoint` with `celery-entrypoint.sh` precisely because they must *not* run migrations.

## S3-Compatible Storage: Two URLs

With S3-compatible storage (RustFS, MinIO, …) in Docker Compose, use two URLs:

- `S3_ENDPOINT_URL` — internal Docker network hostname (e.g., `http://rustfs:9000`), used by boto3 for server-side API calls (uploads, bucket management)
- `S3_EXTERNAL_URL` — browser-accessible URL (e.g., `http://localhost:9000`), used for static file URLs rendered in HTML and presigned URLs

Internal Docker hostnames are unresolvable from the browser. Static files configure `custom_domain` in STORAGES OPTIONS to use the external URL. Presigned URL generation uses a separate boto3 client pointed at the external URL (safe — `generate_presigned_url` is a purely local cryptographic operation, no network call).

## Bucket Policies Over Object ACLs

Use **bucket policies** (not per-object ACLs) for S3 access control. Bucket policies are retroactive, idempotent, and more reliable across S3-compatible services. Per-object ACLs require setting ACL on every `put_object` and don't apply retroactively:

```python
policy = {
    'Version': '2012-10-17',
    'Statement': [{
        'Effect': 'Allow',
        'Principal': {'AWS': ['*']},
        'Action': ['s3:GetObject'],
        'Resource': [f'arn:aws:s3:::{bucket_name}/*'],
    }],
}
client.put_bucket_policy(Bucket=bucket_name, Policy=json.dumps(policy))
```

## Entrypoint Ordering: Init Before Upload

Bucket initialization must run **before** `collectstatic` — buckets must exist before files can be uploaded. Apply bucket policies during initialization:

```
migrate → seed_legal_documents → init_storage_buckets (creates buckets + applies policies) → collectstatic → start server
```
