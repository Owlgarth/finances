---
name: docker-infra
description: Docker, compose, nginx, S3-compatible storage and dev.sh conventions for Owlgarth Finances, plus reference files for compose anchors, image digest refreshes, build contexts, image-build proofs, and backend dependency or Python-version upgrades. Use when editing docker-compose files, Dockerfiles, entrypoints, nginx config, storage setup, or dev.sh.
---

# Docker & Infrastructure

Core rules below. Read the reference files (`.agents/skills/docker-infra/references/`) when the change calls for them:

| When | Read |
|---|---|
| editing compose env blocks or `x-*` anchors, refreshing pinned image digests, adding a cross-tree import to an image build, proving an image build | `references/compose-and-images.md` |
| bumping backend dependencies in `uv.lock`, moving the Python version | `references/dependency-upgrades.md` |
| frontend npm dependency refreshes | `npm-dependency-refresh` skill |
| CI workflows and release publishing | `ci-releases` skill |

## DNS-Safe Service Names

Service names are the hostnames on the compose network, so keep them short and DNS-safe (hyphens, never underscores): `db`, `redis`, `storage`, `api`, `ui`, `worker`, `beat`. botocore, strict URL validators, and RFC 952/1123 reject underscores in hostnames - `ValueError: Invalid endpoint` crashes at runtime.

```
POSTGRES_HOST=db
REDIS_URL=redis://redis:6379
S3_ENDPOINT_URL=http://storage:9000
```
## Configuration Lives in .env

`docker-compose.yml` holds no literal configuration - every credential, hostname and published port is interpolated from `.env` (template: `example.env`). Backend services take the whole file via `env_file`; third-party images (`db`, `storage`) get an explicit `environment:` map so one variable feeds both sides (`RUSTFS_ACCESS_KEY: ${S3_ACCESS_KEY}`) and can't drift. The `ui` service splits the difference: a built image that takes an explicit `environment:` map for just its two runtime knobs (`API_URL`, `DEMO_MODE`), never `env_file` - the file carries secrets, and the nginx container must not receive them.

Published ports are `${DB_PORT}:5432`-style so a second checkout, or a shared Postgres/Redis on the host, can run alongside without editing the compose file. A port shift for a second checkout is a TRIPLE, not a one-variable edit: `VITE_API_URL` (root `.env`; compose interpolates it into the ui service's runtime `API_URL` env, which the container entrypoint writes into `/config.js` at startup - shifting it is a ui recreate, not an image rebuild), `CORS_ALLOWED_ORIGINS`, and `FRONTEND_URL` hardcode the API/UI origins and do NOT derive from `API_PORT`/`UI_PORT` - shifting only the port variables silently points the frontend at the other checkout's backend (or makes CORS reject it), which costs a debugging cycle before anyone suspects the env. Shared setup (build context, `env_file`, volumes, `depends_on`) lives in an `x-backend` anchor at the top of the file.

**The root `.env` is the container world.** Service-host lines (`POSTGRES_HOST=db`, `redis://redis:6379`) stay on compose service names: host-targeted runs get the published-port rewrite at runtime from `dev.sh` (`use_local_hosts`), never by editing the file - flipping them to `localhost` makes a port-shifted checkout silently use a sibling checkout's containers on the default ports, a cross-workspace leak rather than an error. For bare host commands (pytest outside `dev.sh`), `config/settings.py` runs `load_dotenv()` at import, which walks up from `backend/` and loads the ROOT `.env` - container-world values (`POSTGRES_HOST=db`, internal `POSTGRES_PORT=5432`) that host processes cannot reach or that point at a sibling's published default port. The sanctioned override is a gitignored `backend/.env` pinning the host-world values (the developer-`.env` pattern referenced in `config/test_settings.py`).
## Third-Party Image Pins: Tag+Digest, Resolved at Edit Time

Third-party service images are pinned `tag@sha256:...`. Digests are moving targets - resolve them at implementation time, never carry one from a plan snapshot or an older checkout. Pin the manifest-LIST digest: the top-level `Digest:` field of `docker buildx imagetools inspect` (MediaType `...image.index`), not a per-platform digest, and require both amd64 and arm64 in the list before pinning.

When an image has no stable semver tags, pin the newest prerelease/RC tag whose digest differs from `latest`'s - the tag is the semantic choice and a digest on `latest` carries no version signal (rustfs was prerelease-only until stable 1.0.0 shipped; now pinned at newest stable and refreshed by the procedure below).

`prod/` copies third-party pins verbatim from the dev compose - never re-resolve them independently. Nothing automates compose digests since PR #154: Dependabot (the update bot) has no compose manager - it covers Dockerfiles only - so digest refresh and keeping the two files' pins in sync are a manual chore run via the Compose-Digest Refresh Procedure below (accepted gap; the backlog entry 2026-10-27 records the retrigger options).
## Dockerfile ARG Hygiene

ARG values land in image history and in public CI logs - only public values (versions, build flags) go in ARG/ENV, and each new ARG/ENV pair carries a one-line rationale comment saying so. Version ARGs (`APP_VERSION`, `VITE_APP_VERSION`) default to `dev` so plain compose builds need no build-arg changes; the release pipeline passes the real version, and the frontend value is builder-stage only (baked into the JS bundle, absent from the final nginx image). COPY --from tool images (`ghcr.io/astral-sh/uv:*`) pin an exact upstream release tag, re-resolved at edit time - with a lockfile-compat pre-flight when the tool reads the lock (`uv lock --check` under the new version) before editing.
## Lockfile-Enforced npm Installs

Every site that installs frontend dependencies runs `npm ci` - the `frontend/Dockerfile` builder stage and both `dev.sh` `start_frontend` bootstrap arms (the node-container `sh -c` string and the host path). Image and dev bootstrap then install exactly the lockfile tree CI tested and fail loudly on a package.json/package-lock.json mismatch instead of silently resolving around it. The old `npm install --legacy-peer-deps` in the Dockerfile was cargo cult: CI (ci-test.yml) has always run plain `npm ci` on the same lockfile and passes - no peer conflict exists.

- The `[ -x node_modules/.bin/vite ] || npm ci` bootstrap guard stays safe under `npm ci`: it falls through only when vite is absent (node_modules missing or partial) - exactly the states where npm ci's delete-`node_modules`-first behavior is harmless - and a present vite short-circuits with no install, as before.
- The in-container bootstrap arm's `sh -c` string is POSIX sh on purpose: it executes in the node:26-slim container, where `package-lock.json` is visible via the `./frontend` bind mount - dev.sh itself stays bash.
- Remnant grep gates over the repo: `--exclude-dir=<dir>` must come BEFORE the `--` argument terminator - after `--`, grep parses it as a filename and exits 2, which is a gate that never ran, not a pass.
- Keeping the lockfile advisory-clean in the first place (the audit-fix refresh procedure) lives in `npm-dependency-refresh`.
## Dev Script

`./dev.sh` at the repo root is the only one - bash, not POSIX `sh` (`pipefail`, `read -rp`, `local`). Keep new commands in it rather than adding scripts, and keep its `usage()` heredoc in sync.

- `up` - `db redis storage`; `up --full` adds `api ui worker beat`; `up <svc...>` passes through
- `backend` / `frontend` - start the app; `logs`, `manage`, `migrate`, `seed`, `psql`, `test`, `lint`, `npm`
- `release <version>` - fail-closed release pipeline (see below)
- helpers: `load_env`, `use_local_hosts`, `require_service`, `on_host`, `in_service`

It `source`s `.env`, so **values containing spaces must be quoted there** - compose parses that file itself and doesn't care, bash does.

### The `release` command

`./dev.sh release 0.1.0` (bare version; the script adds the `v`) is a fail-closed, ordered pipeline: git-state checks → test gate → VERSION bump → changelog → version sync (the pyproject/package.json sed) → uv lock refresh → stage → commit → tag → push. Preserve the ordering and its irreversibility guards: VERSION is re-read after write, tag absence is re-verified immediately before `git tag`, and staging is always an explicit literal file list (VERSION + CHANGELOG.md unconditionally; pyproject/package.json/uv.lock only when `git diff --quiet -- <path>` reports them changed, so a no-op release stays clean). Git-state checks (branch, clean tree) are fatal in real runs but report-only under `--dry-run` so a dry run works from any checkout; the local gate invokes `./dev.sh lint` / `./dev.sh test` as child processes rather than refactoring the case arms.

**A version bump must regenerate `backend/uv.lock` in the same step.** uv.lock pins the project's own version (`[[package]] name = "api"`), so the sed alone leaves `uv sync --locked` in the backend image build failing on the tag - the v0.2.0 incident; v0.1.0 had survived only because its bump was a no-op. The refresh sits after the version sync and before staging, so the release commit carries version + lock together and, under `set -euo pipefail`, a failed refresh aborts with nothing staged. `frontend/package-lock.json` is the tolerating consumer (embeds `0.0.0`, never synced, `npm ci` accepts the mismatch) - leave it alone, no symmetric npm fix exists.

- Lock interop is host-writes/container-consumes: a lock refreshed by host uv 0.11.28 was accepted by the image-pinned uv 0.12.8 as a no-op resolve. Re-check that pair if either side is upgraded - a lockfile `revision` bump could break it.
- When simulating a bump to exercise the pipeline, the version string must be valid PEP 440: uv rejects labels like `0.3.0-test` (exit 2, nothing written to the lock).
- The pipeline never touches compose files - every release cut is one of the Compose-Digest Refresh Procedure's triggers; run it before the cut.

### DEV_TARGET: container or host

`DEV_TARGET=docker` (the default, from `.env`) runs backend/frontend commands in the `api` and `node` containers, so no Python/uv/Node is needed on the machine - the case a PyCharm remote interpreter targets. `DEV_TARGET=host` runs them through `uv`/`npm` locally and is the only path that needs `use_local_hosts`.

`in_service` execs into the service when it is up and uses `docker compose run --rm --entrypoint ''` otherwise (the image entrypoint would migrate and collectstatic). Both pass `--user "$(id -u):$(id -g)" -e HOME=/tmp`: **without the uid mapping every file the command writes into the bind mount - new migrations, `.pytest_cache`, `.ruff_cache` - lands root-owned in the checkout**, and without `HOME` uv/npm fail trying to write `/.cache`.

Backend commands resolve through `/venv/bin/<tool>` (`UV_PROJECT_ENVIRONMENT`), not `uv run`, which would try to sync the environment it cannot write.

uv subcommands are a third route and never go through `backend_run`: its host arm would run `uv run <cmd>` (wrong subcommand - it syncs the venv first) and its docker arm execs `/venv/bin/uv`, which does not exist (uv lives at `/bin/uv` in the image). Route them by tool availability, not DEV_TARGET: `command -v uv` succeeds → host `(cd backend && uv <cmd>)`, else `in_service api uv <cmd>` - the dev compose bind-mounts the source and `in_service`'s uid mapping keeps the container-side write host-owned. `uv lock` needs no `use_local_hosts` (it touches no services), and the one uncovered combination, no host uv AND no Docker, cannot run `dev.sh` at all.

The `node` service (profile `tools`) exists only for this: `node:26-slim` with `./frontend` bind-mounted. Debian-based, so the `node_modules` it writes stays usable if the host also runs npm - an alpine/musl image would install incompatible prebuilt binaries. The native-binary population is toolchain-relative (post-PR-#179: `@rolldown/binding-*`, `lightningcss`, and `@tailwindcss/oxide` platform children, plus `@swc/core` - i18next-cli's parser engine and the only postinstall carrier since esbuild left the tree entirely with i18next-parser) - re-anchor the exemplars whenever the build chain swaps.

`use_local_hosts` exists because the same `.env` serves both worlds: inside compose a service is reached by name (`db`, `redis:6379`), from a host process only through the published port (`localhost:$DB_PORT`). Anything host-run must go through it, or it silently tries to resolve `db`.
## Nothing Container-Owned Inside the Bind Mount

The backend containers run as root against a bind-mounted, host-owned source tree, so any path a named volume mounts *inside* `/app` gets created on the host as a root-owned directory - which then blocks the host toolchain (`uv` can't write `backend/.venv`, `npm` can't write `frontend/node_modules`). Keep generated artefacts outside the mount:

- `UV_PROJECT_ENVIRONMENT=/venv` in the backend image, volume mounted at `/venv`
- Celery beat gets `--schedule=/tmp/celerybeat-schedule`
- The `ui` service is the nginx production build (no bind mount, no `node_modules` volume); frontend hot reload comes from `./dev.sh frontend` (Vite in a one-off `node` container run as the invoking user, or on the host with `DEV_TARGET=host`), so `frontend/node_modules` is always host-owned

Compose otherwise builds **one image per service** from the same Dockerfile, so `docker compose build api` would leave `worker`/`beat` on the old image - which is how a stale worker once recreated a root-owned `/app/.venv`. `api`, `worker` and `beat` therefore share one tag via the anchor:

```yaml
x-backend: &backend
  build: ./backend
  image: ${COMPOSE_PROJECT_NAME}-backend
```

Compose interpolates `COMPOSE_PROJECT_NAME` from the derived project name (the directory), so sibling checkouts keep separate images. Any new service built from `backend/` must use the anchor, never a bare `build:`.

Tooling config must not rely on `.gitignore` for exclusions: `/app` in the container isn't a git checkout. Ruff uses `extend-exclude` so its built-in `.venv` exclusion survives.
## nginx Header Inheritance

nginx does NOT inherit parent-context `add_header` directives into child blocks that define their own `add_header`. Security headers (CSP, HSTS, X-Frame-Options, etc.) must be repeated in each `location` block that has its own `add_header` - e.g., `location = /index.html` and the static-assets regex location. Critical for SPAs where `try_files` internally redirects to `/index.html`.
## One Entrypoint, Overridden Commands

`api` keeps the image `ENTRYPOINT` (`docker-entrypoint.sh`: migrate → seed → bucket init → collectstatic) and only overrides `command` to add `--reload`. Never inline a copy of that script in `docker-compose.yml` - the copy silently drifts (it used to skip `seed_currencies`). Celery services override `entrypoint` with `celery-entrypoint.sh` precisely because they must *not* run migrations.
## S3-Compatible Storage: Two URLs

With S3-compatible storage (RustFS, MinIO, …) in Docker Compose, use two URLs:

- `S3_ENDPOINT_URL` - internal Docker network hostname (e.g., `http://rustfs:9000`), used by boto3 for server-side API calls (uploads, bucket management)
- `S3_EXTERNAL_URL` - browser-accessible URL (e.g., `http://localhost:9000`), used for static file URLs rendered in HTML and presigned URLs

Internal Docker hostnames are unresolvable from the browser. Static files configure `custom_domain` in STORAGES OPTIONS to use the external URL. Presigned URL generation uses a separate boto3 client pointed at the external URL (safe - `generate_presigned_url` is a purely local cryptographic operation, no network call).
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

Bucket initialization must run **before** `collectstatic` - buckets must exist before files can be uploaded. Apply bucket policies during initialization:

```
migrate → seed_legal_documents → init_storage_buckets (creates buckets + applies policies) → collectstatic → start server
```
