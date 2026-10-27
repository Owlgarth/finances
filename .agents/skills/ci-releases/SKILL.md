---
name: ci-releases
description: GitHub Actions workflows and release tooling for Owlgarth Finances - action pin verification via the git refs API, reusable workflow_call test gates, the production-dependency npm audit gate, dual-arch GHCR image publishing, render-testing version-pinned binaries (git-cliff), Dependabot config facts (.github/dependabot.yml: schema validation, schedule/groups semantics, the uv ecosystem, no compose manager) and silently-inactive-Dependabot diagnosis. Use when editing .github/workflows/*, cliff.toml, VERSION, .github/dependabot.yml, or anything on the tag-to-release pipeline.
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

## Dependabot Config Facts (.github/dependabot.yml)

Five entries, all `weekly` Monday 05:00 `Europe/Warsaw`: `npm` @ `/frontend`, `uv` @ `/backend`, `github-actions` @ `/`, `docker` @ `/backend`, `docker` @ `/frontend` (PR #154). The `docker` ecosystem covers Dockerfile base images only - Dependabot has NO compose manager, so compose image digests stay manual (rule in `docker-infra`).

- `groups: minor-and-patch` (on npm, uv, github-actions) batches minor+patch into ONE PR per ecosystem; majors deliberately stay individual reviewable PRs. Everything else is Dependabot default - no commit-message, labels, or reviewers overrides; do not over-configure.
- The schedule transcribes the old Renovate cron (`* 5-8 * * 1`, a Monday-morning window) through the mechanism switch: when swapping update tools, preserve schedule/scope SEMANTICS in the new tool's vocabulary, not its syntax.
- Validate edits against the official SchemaStore `dependabot-2.0` JSON schema, a stronger gate than a YAML parse: a schema-invalid config silently disables Dependabot with no error anywhere (no failed run, no red X), so syntactically valid YAML is not proof the bot will run.
- `uv` is a supported ecosystem (backend deps resolve from uv.lock). If a uv-ecosystem PR ever looks wrong, check astral-sh/uv#2512 first - known open uv edge cases in Dependabot.

### Diagnosing a silently-inactive Dependabot

Zero Dependabot artifacts (no PRs, no `dependabot/*` branches) is a config problem, not an installation problem: Dependabot is first-party, needs no app install, and activates when `.github/dependabot.yml` lands on the default branch. History: this repo's `renovate.json` once configured a Renovate app the user declined to install (PR #152's drift diagnosis caught it by probing the org's installed apps - a validating config that nothing ever read is indistinguishable from a broken one); PR #154 replaced it with Dependabot, so do not re-propose a third-party update app.

- Artifact-absence probes: `gh pr list --search "author:app/dependabot" --state all` and `git ls-remote --heads origin | grep -i dependabot`. Zero across BOTH means it never ran, not that it is slow - the same probe family that caught never-installed Renovate, adapted to Dependabot's author and branch prefix. (It is live here: `dependabot/*` branches already exist.)
- Repo-side causes are the config's schema validity (gate above) and the file's presence on the default branch. Repo/org-level enablement (Settings -> Code security -> Dependabot version updates) is a user action, not a repo fix.

The `./dev.sh release` command itself (bash semantics, fail-closed ordering) lives in docker-infra's Dev Script section.
