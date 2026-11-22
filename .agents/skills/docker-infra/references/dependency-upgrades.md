# Backend Dependency and Python-Version Upgrades

Part of the `docker-infra` skill. Read before bumping backend dependencies in `uv.lock` or moving the Python version.

## Backend Dependency Bumps: Targeted Lock Upgrades

A pinned backend dependency bump edits the `pyproject.toml` specifiers, then refreshes `backend/uv.lock` with targeted flags - `uv lock --upgrade-package <name>` over exactly the named packages, never a blanket `uv lock --upgrade`: the blanket form sweeps unrelated packages into the same commit and destroys the revert-as-a-unit property. Adjudicate the lock diff BEFORE committing (changed versions extracted from `git show HEAD:backend/uv.lock` vs the working tree); a package outside the expected set is a STOP - reverse-map it with `uv tree --invert --package <name>` before anything lands. Content-identical `-`/`+` lines inside a rewritten `[[package]]` entry (`wheels = [`, `source = { registry }`) are diff re-anchors, not semantic changes - compare removed/added multisets before treating them as drift. Land the deps commit (pyproject + uv.lock) separately from any tool-induced reformat: ruff >= 0.17 formats Python blocks inside Markdown, so a ruff bump can reflow `backend/*.md` fenced code - that reformat rides its own revertable commit, and any new fenced Python block under `backend/` must satisfy `ruff format` or CI's `ruff format --check .` fails. Lock interop (host uv writing, image-pinned uv reading) follows the `release`-command rule above. The running api/worker/beat keep the pre-bump deps until the shared image is rebuilt and they are recreated - `docker compose up -d --build api worker beat` (the `x-backend` anchor makes one build serve all three); probing a stale container proves nothing about the new set.

**Protocol-coupled client/server bumps ride ONE commit.** When the bumped dependency talks a protocol to a pinned third-party image - the kombu/redis-py broker transport against the `redis` compose image - the pyproject pin swap, the targeted lock refresh, and the compose tag+digest move in BOTH compose files (run through the Compose-Digest Refresh Procedure) are a single revertable commit. The two sides are protocol-coupled, so splitting them across commits ships either the stack or the code on a client/server version pair never tested together, and the split reverts only piecemeal (kombu 5.7 + redis-py 8.1 + redis:8-alpine, PR #193, moved as exactly this unit). The pyproject pin's ceiling mirrors the transport library's own declaration - `redis>=8.1,<9` carries kombu 5.7's `redis>=6.4,<9`, with a comment saying so - because a floor-only pin would let a later bump drift the pair past what the transport declares; the mirrored ceiling makes every future move a conscious pairing decision.

## Python-Version Migrations: Three Files Move Together

A backend python-version bump is three coordinated edits, never a FROM-only change: the
Dockerfile `FROM python:X.Y-slim` line, `backend/.python-version`, and a targeted lock refresh
(the Backend Dependency Bumps pattern applied to the wheel-availability set instead of a
pyproject specifier) to versions shipping cp3XY wheels for everything that would otherwise
compile from source. Each piece flips a different toolchain: the FROM line flips the image,
`.python-version` flips CI - setup-uv is passed no python-version input, so the runner's
`uv sync` reads the file - and the lock decides whether the image build needs a compiler. A
FROM-only bump (the Dependabot shape) is a false green per Image-Build Verification above: CI
never builds the image, so it stays green testing the OLD python while the real build fails the
wheel-only gate at the first source-building package (PR #191 superseding #187: cffi 2.0.0 had
no cp315 wheels, so the image died at `Building cffi` / `ffi.h` with CI green).

Two migration-specific traps:

- **The `backend-venv` named volume shadows the new image's `/venv`.** A volume populated by an
  older python still mounts over the freshly built one and its `bin/python` symlink dangles -
  any in-container proof before `docker volume rm <project>_backend-venv` runs a dead
  interpreter and proves nothing (the stale-container rule in Backend Dependency Bumps, one
  layer down: there the container outlives the change, here the volume does).
- **Pinned suite counts must name the toolchain that produced them.** A planning trial on a
  host beta python (3.15.0b3) showed 5 runtime-conditional skips that un-skip on the final
  image: 1360 passed / 5 skipped host-beta vs 1365 / 0 container-final, identical collection.
  A count pinned without its toolchain sends the executor after a phantom drift when the other
  toolchain reproduces the other number - record which python ran a pinned count in every
  migration plan.
