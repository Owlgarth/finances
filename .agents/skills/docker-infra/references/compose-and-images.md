# Compose Files and Image Builds

Part of the `docker-infra` skill. Read before editing compose env blocks or anchors, refreshing pinned image digests, adding cross-tree imports to an image build, or proving an image build.

## Env De-duplication: Map-Form `x-*` Anchors

When several services share an identical `environment:` subset, hoist it into a root-level extension field in **map syntax** and merge it in - list-form `environment:` (`- KEY=VAL`) has no anchor/merge mechanism, so converting the merged blocks to map form is part of the change:

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

- Compose treats top-level `x-*` keys as opaque pass-through - the anchor block never becomes a container. Move explanatory comments onto the anchor so the *why* lives with the values.
- Only merge where the shared vars genuinely match in kind - forcing an anchor onto a service that never had those vars injects them (and `environment:` wins over `env_file`, so it would also shadow `.env` values).
- Map-form quoting: quote `true`/`false`/numbers to document intent, and `*`-valued keys MUST be quoted (`ALLOWED_HOSTS: '*'` - a bare `*` is the YAML alias indicator). Rule of thumb: quote any value that is a bool/null/number or starts with `*`/`&`/`!`/`|`/`>`/`{`/`[`.

**Verification gate - `docker compose config` rendered diff, never `up`:** capture `docker compose config` before and after the edit and diff the two. `config` normalizes list- and map-form `environment:` into the same sorted-map rendering, so a correct de-dup shows exactly one hunk - the rendered `x-*` block itself - and zero service-level changes; any moved env line means a corrupted value. (`up` is never a verification tool in this stack: services bind shared host ports and images do slow boot work.) Two more edges for any count-based gate over rendered output: top-level `x-*` extension fields render verbatim in addition to every service that merges them, so anchor-block copies inflate counts (this is why `restart: unless-stopped` sits on `api`/`worker`/`beat` individually in `prod/` rather than the shared anchor - inside the anchor it renders an extra time and a 7-policy gate counts 8); and `config` renders interpolated secrets in cleartext, so before/after captures stay under /tmp/opencode, never in the repo. A third edge: profile-gated services (the `node` service sits behind profile `tools`) render ONLY when `--profile <name>` precedes the `config` subcommand - a default render silently omits them and the before/after diff gate goes blind to exactly those services (re-derive a lost baseline from git rather than re-capturing blind). Render baselines with every profile the diff is supposed to cover: `docker compose --profile tools config`. A fourth edge, when the render targets `prod/` compose: `env_file:` paths are existence-checked against the project directory, and `--env-file` feeds interpolation only - so the `x-backend` anchor's `env_file: .env` exits 1 wherever `prod/.env` is absent (it is never created); the scratch-project-dir workaround is the fence in the Compose-Digest Refresh Procedure below.

## Compose-Digest Refresh Procedure

The pinning rules above resolve digests at edit time; this procedure re-resolves them later. It is manual by standing user decision (2026-10-27) - the backlog entry of that date records the retrigger options (a small scheduled digest-bump workflow, or self-hosted Renovate with its docker-compose manager). Two triggers:

- every release cut - the `release` pipeline never touches compose files, so the refresh is a separate pre-cut step
- immediately on a CVE in a pinned third-party image

Inventory: four tag@digest pins, one per third-party image, IDENTICAL in `docker-compose.yml` and `prod/docker-compose.yml` - `db` (postgres), `redis`, `storage-init` (busybox), `storage` (rustfs). Two image lines are never in scope: the dev `node` tools image is a plain tag with no digest (`node:26-slim`), and the prod GHCR images (`finances-backend`/`finances-ui`) are parameterized by `APP_VERSION` - the release pipeline resolves them.

**Drift-check.** One `docker buildx imagetools inspect <name:tag>` per pinned image; compare the top-level `Digest:` field with the pinned digest. Every NEW digest re-satisfies the pinning section's rules (manifest-LIST digest, amd64 and arm64 both present) - never inherit the old pin's verification. Re-run the inspect at execution time even when a plan pins expected digests: the registry can move again between planning and execution.

**Update.** Edit BOTH files with the identical new reference - `prod/` copies the dev pins verbatim, never re-resolves (pinning-section rule). Keep tag and digest matched: a digest-drift refresh keeps the tag (postgres, redis, busybox); a version move changes tag and digest together, and a new tag with the old digest fails to pull outright (the digest belongs to the old tag's manifest). When a stable semver has appeared for an image pinned as prerelease, move to the newest stable whose digest satisfies the platform rules - the prerelease pin was a stopgap, not a preference (worked example: rustfs `1.0.0-rc.4` -> `1.0.4`, the newest stable, its digest identical to `latest`'s). Enumerate the candidate stable tags via the registry's tag listing (the hub UI or its tags API) - `imagetools inspect` resolves a known tag and cannot list them.

**Verify.** The `docker compose config` rendered-diff gate (Env De-duplication section above) applies in full - `up` is never a verification tool:

```bash
docker compose --profile tools config > /tmp/opencode/compose-before.yml   # dev, BEFORE editing
mkdir -p /tmp/opencode/prod-render                                         # scratch project dir, NEVER prod/.env
cp prod/.env.example /tmp/opencode/prod-render/.env                        # env_file existence target + interpolation source
docker compose -f prod/docker-compose.yml --project-directory /tmp/opencode/prod-render \
  --env-file /tmp/opencode/prod-render/.env config > /tmp/opencode/prod-before.yml
# ... edit both compose files, then:
docker compose --profile tools config > /tmp/opencode/compose-after.yml
docker compose -f prod/docker-compose.yml --project-directory /tmp/opencode/prod-render \
  --env-file /tmp/opencode/prod-render/.env config > /tmp/opencode/prod-after.yml
diff /tmp/opencode/compose-before.yml /tmp/opencode/compose-after.yml
diff /tmp/opencode/prod-before.yml /tmp/opencode/prod-after.yml
```

Expected hunks: exactly the changed `image:` lines (db, redis, storage-init, storage in dev; the same four in prod) and nothing else. The `node` service renders only under `--profile tools` - its image line is a plain tag and never appears in the diff, but the baseline must still cover it. Captures interpolate secrets in cleartext and stay under /tmp/opencode, never in the repo; the prod render runs against a /tmp/opencode scratch project directory holding a `.env` copied from `prod/.env.example` (the `x-backend` anchor's `env_file: .env` is existence-checked against the project directory, and `--env-file` alone does not satisfy it) - never create `prod/.env`. Then recreate the dev stack - `./dev.sh down && ./dev.sh up` pulls the new digests for db, redis, storage-init and storage, and the healthchecks gate the result. When the `storage` TAG moved rather than just its digest, also exercise the S3 path (a boto3 upload/download round-trip against storage; the api container carries boto3 - `docker compose exec -T api /venv/bin/python`) - the one image whose version, not just rebuild, can change behavior; the other three need only the healthcheck gate.

## Out-of-Context Imports: Named Additional Build Contexts

When source inside a build context imports a file that lives outside it (frontend files importing the shared `backend/common` registries - `languages.json`, `fonts.json`), host dev and host-checkout CI both see the file (vite grants `server.fs.allow` to the repo root; CI builds on the full checkout), so the gap surfaces only in Docker builds: a TS2307 at image-build time, after review. Never fix it by widening the build context to the repo root (context bloat, needs a root `.dockerignore`) or by copying the file into the source tree (guaranteed drift - the registry is single-sourced per the i18n contract). Supply the file as a named additional build context, mirrored at the EXACT in-container path the unchanged relative imports resolve to:

```yaml
# docker-compose.yml - ui build (context: ./frontend, WORKDIR /app;
# imports from /app/src/** resolve to /backend/common/languages.json)
additional_contexts:
  backend: ./backend
```

```dockerfile
# frontend/Dockerfile
COPY --from=backend common/languages.json /backend/common/languages.json
COPY --from=backend common/fonts.json /backend/common/fonts.json
```

- **One COPY line per imported file - enumerate, never widen.** Every out-of-context import gets its own `COPY --from=backend common/<name>.json` line at the exact in-container path the relative imports resolve to; a new registry crossing the boundary is one new COPY line, never a widened context and never a copy of the file into `frontend/`. The named context supplies the whole directory wholesale, so a missed line is invisible on the host (vite `server.fs.allow`, full-checkout CI) and surfaces only as a TS2307 at Docker image-build time, after review - any plan adding a cross-tree import must pair it with the COPY line in the same plan.
- release.yml (build-push-action): `build-contexts: backend=./backend` fed from a per-image `build_contexts` matrix field, empty string on legs that need none (the action skips the flag on empty input - see the `ci-releases` skill).
- Runtime containers that bind-mount the source tree (the `node` tools service) need the same path as a read-only bind mount (`./backend:/backend:ro`) - imports resolve through the filesystem there, not through build contexts.
- Verify the named context's source tree is not excluded by its `.dockerignore` (`backend/.dockerignore` must not exclude `common/`) before relying on the context.
- **Comment-accuracy riders ride the change.** Comments describing the cross-boundary set singularize it ("the shared registry", "one file, two consumers"); when the set grows, reword every one in the same commit - the Dockerfile block, the compose ui-build and node-mount comments, the release.yml matrix comment, `frontend/README.md` - gated by a grep for the singular phrasing reaching zero. A stale comment teaches the next reader a wrong inventory of what the mechanism supplies.

## Image-Build Verification: BuildKit Store vs Classic Store

PR CI (ci-test.yml) never builds Docker images - image builds happen only in the release
pipeline - so a local `docker compose build ui` is the only pre-merge end-to-end gate for a
builder-line change: it exercises the base-image pull, `npm ci`, the named-context COPY steps,
and `tsc -b && vite build` that CI never touches (a Dependabot PR bumping a FROM line can be
fully green on a builder it never ran). One trap when scripting gates around it: a base image
pulled BY a build lands in the BuildKit cache, not the classic image store - `docker image
inspect <image>` fails right after a successful build that visibly pulled the image's layers.
An explicit `docker pull <image>` registers it in the classic store (digest identical to the
build's resolve). A gate step that expects `image inspect` to succeed after a build must pull
first, or it fails on store mechanics instead of the build.

The step LOG is a separate trap: BuildKit replays no step output for cached steps, so a
second `docker compose build ui | tee build.log` overwrites the first run's full log with a
near-empty summary (PR #177: the cached re-run silently replaced the tee'd uncached log,
and the full step log required a `--no-cache` re-run). When the step log itself is the
evidence, re-run with `--no-cache` or preserve the first run's capture.

A wheel-only gate over that log - asserting no package compiles from source on the new base
image - greps for `Building <pypi-package>` and needs literal-match adjudication: the bare
substring `Building ` has benign hits (apt's `Building dependency tree...` line, compose's
`Image <tag> Building` progress header), so a substring match fails the gate on every build.
The failure signature is a pypi package name in that position plus compiler errors (`Building
cffi` followed by fatal `ffi.h` errors = no wheel for the bumped python).
