---
name: ci-releases
description: GitHub Actions workflows and release tooling for Owlgarth Finances - action pin verification via the git refs API, reusable workflow_call test gates, the production-dependency npm audit gate, dual-arch GHCR image publishing, render-testing version-pinned binaries (git-cliff), Renovate config facts and never-ran Renovate diagnosis. Use when editing .github/workflows/*, cliff.toml, VERSION, renovate.json, or anything on the tag-to-release pipeline.
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
- Editing ci-test.yml: the phrase `Install dependencies` appears TWICE (backend `uv sync`, frontend `npm ci`) - include the `run: npm ci` line in any edit anchor, or the match is ambiguous.

## Production Dependency Audit Gate (ci-test.yml)

The frontend job runs `npm audit --omit=dev --audit-level=high` between `npm ci` and the i18n check. The exit code alone IS the failure mechanism: the command exits non-zero exactly when a high-or-worse advisory exists in the production tree - no output parsing, `if:` conditions, or result wiring. Shipped because react-router 7.11.0 and follow-redirects 1.16.0 reached deployed self-hosted release images while lint/build/i18n stayed green: CI never evaluated advisories.

- Flags are frozen by design: `--omit=dev --audit-level=high` gates the PRODUCTION tree at high severity. Dev-only advisories ship nothing to users and deliberately do not gate (they would periodically break CI for no deployed risk). Adding `--force`, `--package-lock-only`, `--json`, `id:`, `timeout-minutes:`, or `continue-on-error` changes the gate semantics (`continue-on-error: true` silently disables it).
- When the gate fails, the fix is a dependency refresh gated on the end state (the `npm-dependency-refresh` skill), never loosening the flags; moderate/low or dev-only findings exit 0 and are non-events for CI.

## Release Workflow (release.yml)

- Dual-arch via two native builds (`ubuntu-latest` amd64 + `ubuntu-24.04-arm` arm64), no QEMU; per-arch literal tags merged with `docker buildx imagetools create`.
- `needs:` carries only DIRECT dependencies: list `version` explicitly in every consuming job even when another `needs` entry implies it transitively.
- Release notes flow through the git-cliff action's `OUTPUT` env file into `gh release create --notes-file`; never pass multiline content through `${{ }}` interpolation.
- `workflow_dispatch` rebuilds run the test gate but skip the GitHub Release: `if: github.event_name == 'push'`.
- Concurrency group `inputs.ref || github.ref` serializes tag pushes and dispatches separately. A dispatch rebuild of an older tag moves `latest` backward - inherent to the tag scheme; keep the in-file comment.
- `build-contexts:` comes from a per-image `build_contexts` matrix field - `backend=./backend` on the ui legs, `""` on the backend legs (build-push-action skips the flag on an empty input). The rule it serves - mirroring out-of-context imports via named additional contexts at the exact resolved path - lives in the `docker-infra` skill.

## Render-Test Binaries Pinned by Version

Anything whose behavior is pinned BY VERSION gets render-tested against the real downloaded artifact, not doc-verified. git-cliff v2.13.1 lacks the `commit_groups` Tera filter (it exists only on unreleased main) - planning-time doc reads passed while the real binary failed. The failure is sneaky: exit 1 behind a WARN on stdout, so it slips through pipes. Keep a scratch binary in /tmp/opencode/bin and render every mode (tag, unreleased-no-tag, stripped header) before committing template changes.

`cliff.toml` carries `postprocessors` that normalize em/en dashes (`\x{2014}`/`\x{2013}` regex escapes) to plain hyphens: CHANGELOG.md and release notes are generated into the repo, the repo bans em dashes in committed text, and historical commit subjects carry them.

## Renovate Config Facts (renovate.json)

- Docker manager names are `dockerfile` and `docker-compose` - `docker` is a preset category, not a manager.
- `config:recommended` does not bundle `docker:pinDigests`; add it explicitly.
- Schedules use cron syntax (`* 5-8 * * 1`); Later-string syntax is deprecated.
- Python deps use the `pep621` manager - no `uv` manager exists; uv.lock presence selects the uv path officially.
- Validate with `npx --yes renovate-config-validator` - newer npm also needs `--package renovate`.

### Diagnosing a Renovate that never ran

When Renovate produces zero artifacts (no PRs, no dashboard issue, no branches), check the GitHub App installation BEFORE the config: a validating config that nothing ever read is indistinguishable from a broken one until you list the org's installed apps. Blaming the schedule or manager names is wrong when the app is simply absent - the org probe found only `claude` installed while `renovate.json` validated clean (PR #152's drift diagnosis).

- Installation probe: `gh api /orgs/<org>/installations --jq '.installations[].app_slug'` (needs an org-owner token with admin:org). Do NOT use `gh api /repos/<owner>/<repo>/installation` - it requires GitHub App JWT auth and 401s with a user PAT ("A JSON web token could not be decoded"), saying nothing about installation; `/user/installations` likewise 403s with a PAT.
- Artifact-absence probes: `gh pr list --search "author:app/renovate" --state all`, `gh issue list --author "app/renovate"` (the dependency-dashboard issue would exist from the first run - `config:recommended` enables it), and `git ls-remote --heads origin | grep -i renovate`.
- Report-only posture: config defects are the only fixable-in-repo cause; installation state, app config, and dashboard state are user actions (github.com/apps/renovate -> Install -> org, verify at github.com/organizations/<org>/settings/installations). Expect a large first batch once installed (30+ npm PRs plus docker/actions/pep621 PRs).

The `./dev.sh release` command itself (bash semantics, fail-closed ordering) lives in docker-infra's Dev Script section.
