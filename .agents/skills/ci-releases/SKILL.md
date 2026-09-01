---
name: ci-releases
description: GitHub Actions workflows and release tooling for Owlgarth Finances - action pin verification via the git refs API, reusable workflow_call test gates, dual-arch GHCR image publishing, render-testing version-pinned binaries (git-cliff), Renovate config facts. Use when editing .github/workflows/*, cliff.toml, VERSION, renovate.json, or anything on the tag-to-release pipeline.
---

# CI & Releases

## Verifying an Action Pin: the Git Refs API, Not the Release Page

A `uses: owner/action@vN` pin is valid only if the runner can resolve the ref. Verify by probing `refs/tags/vN` through the git refs API exactly as the runner resolves it:

```bash
curl -sf https://api.github.com/repos/astral-sh/setup-uv/git/ref/tags/v10 > /dev/null && echo resolvable
```

A published release page is NOT proof. astral-sh/setup-uv ships exact tags (`v10.0.1`) but no bare moving-major tags - `refs/tags/v10` and `v9` are 404. This shipped in PR #118 and broke real CI post-merge. When the bare major cannot be resolved, pin the exact current release tag (`@v10.0.1`) with a one-line rationale comment.

## Reusable Test-Gate Workflow

`.github/workflows/ci-test.yml` (`workflow_call`) holds lint + pytest + frontend build; `ci.yml` is a thin caller keeping only name + triggers.

- Keep the caller byte-identical: sibling feature branches edit `ci.yml` too, and a minimal file minimizes merge conflicts (proven when the i18n branch landed mid-PR and the caller body was the single conflict).
- pytest needs only a Postgres service container: `config/test_settings.py` self-provides SECRET_KEY/JWT keys, LocMemCache, eager Celery, and disables S3. Do not add Redis or other services.
- Gotcha: when a PR becomes CONFLICTING, GitHub cannot build the merge ref and silently stops creating `pull_request` workflows - checks vanish with no error. Checks disappearing right after a main merge means merge `origin/main` into the branch first.

## Release Workflow (release.yml)

- Dual-arch via two native builds (`ubuntu-latest` amd64 + `ubuntu-24.04-arm` arm64), no QEMU; per-arch literal tags merged with `docker buildx imagetools create`.
- `needs:` carries only DIRECT dependencies: list `version` explicitly in every consuming job even when another `needs` entry implies it transitively.
- Release notes flow through the git-cliff action's `OUTPUT` env file into `gh release create --notes-file`; never pass multiline content through `${{ }}` interpolation.
- `workflow_dispatch` rebuilds run the test gate but skip the GitHub Release: `if: github.event_name == 'push'`.
- Concurrency group `inputs.ref || github.ref` serializes tag pushes and dispatches separately. A dispatch rebuild of an older tag moves `latest` backward - inherent to the tag scheme; keep the in-file comment.

## Render-Test Binaries Pinned by Version

Anything whose behavior is pinned BY VERSION gets render-tested against the real downloaded artifact, not doc-verified. git-cliff v2.13.1 lacks the `commit_groups` Tera filter (it exists only on unreleased main) - planning-time doc reads passed while the real binary failed. The failure is sneaky: exit 1 behind a WARN on stdout, so it slips through pipes. Keep a scratch binary in /tmp/opencode/bin and render every mode (tag, unreleased-no-tag, stripped header) before committing template changes.

`cliff.toml` carries `postprocessors` that normalize em/en dashes (`\x{2014}`/`\x{2013}` regex escapes) to plain hyphens: CHANGELOG.md and release notes are generated into the repo, the repo bans em dashes in committed text, and historical commit subjects carry them.

## Renovate Config Facts (renovate.json)

- Docker manager names are `dockerfile` and `docker-compose` - `docker` is a preset category, not a manager.
- `config:recommended` does not bundle `docker:pinDigests`; add it explicitly.
- Schedules use cron syntax (`* 5-8 * * 1`); Later-string syntax is deprecated.
- Python deps use the `pep621` manager - no `uv` manager exists; uv.lock presence selects the uv path officially.
- Validate with `npx --yes renovate-config-validator` - newer npm also needs `--package renovate`.

The `./dev.sh release` command itself (bash semantics, fail-closed ordering) lives in docker-infra's Dev Script section.
