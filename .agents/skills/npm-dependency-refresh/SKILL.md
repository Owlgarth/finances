---
name: npm-dependency-refresh
description: Frontend npm dependency refreshes for Owlgarth Finances - audit-fix/update/audit-fix end-state sequencing, allowScripts derivation from the post-update tree, the lockfileVersion 3 compat gate, floor bumps for production-security direct deps vs backlog majors, clean-reinstall proof. Use when refreshing or bumping frontend dependencies in frontend/package.json, triaging npm audit findings or a CI audit-gate failure, or regenerating frontend/package-lock.json.
---

# npm Dependency Refresh

The refresh procedure for `frontend/` dependencies. The CI gate that detects advisories
(`npm audit --omit=dev --audit-level=high` in ci-test.yml) lives in `ci-releases`; the
lockfile-enforced install sites (Dockerfile builder, dev.sh bootstrap) live in `docker-infra`.

## Sequence: audit fix -> npm update -> audit fix again

`npm update` re-resolves the tree and can re-expose or newly surface in-range advisories AFTER a
clean `npm audit fix` round (PR #152: a re-hoisted esbuild <=0.24.2 plus a fresh js-yaml chain - 3
advisories reappearing after a first fix round that had reported 0). Gate on the END state, never
an intermediate step:

- Run `npm audit fix` -> `npm update` -> a SECOND `npm audit fix`; only the FINAL tree's audit must
  read 0 vulnerabilities.
- `npm update` never crosses a semver range boundary: the `typescript ~5.9.3` tilde pin held with
  zero flags, and no `--force` was used anywhere. A fix that needs a range change is a floor bump;
  a major is backlog.
- Floor-bump only direct production deps with a security motive (react-router-dom `^7.10.1` ->
  `^7.18.4`, the Link/useNavigate open-redirect fix). Semver majors (tailwind 4, vite 8,
  react-day-picker 10, typescript 7) stay deferred to the backlog for manual refreshes; Dependabot
  is the long-term range manager (live since PR #154) - minor+patch arrive as one grouped PR per
  week, majors as individual reviewable PRs (config facts in `ci-releases`). The security
  floor-bump rule above still governs manual refreshes; it is not a Dependabot-PR triage rule.
- When the CI audit gate fails, the remediation is this sequence - never loosening the gate flags
  (gate semantics in `ci-releases`).

## allowScripts: derive from the live post-update tree

- Derive `allowScripts` from the actual post-update tree (`npm install-scripts ls`, plus
  `npm ls <pkg> --all` for nested duplicates - the tree carried two live esbuild instances, 0.25.12
  via i18next-parser and 0.28.2 via vite), never from spec predictions: versions move during the
  update, so a predicted entry set pins stale versions.
- `npm install-scripts approve <pkg>` prunes the stale entries itself - no hand-editing needed.
- The `.npmrc allow-scripts setting is being ignored` warning is ENVIRONMENTAL (user-level config
  on dev machines only); CI and Docker never see it. The gated warning is only "N package has
  install scripts blocked".

## lockfileVersion 3 is a hard gate

After any npm run that rewrites `frontend/package-lock.json`, verify `lockfileVersion: 3` in the
file: host npm is 12 (writes v3 today, v4 if it ever changes default) while the Docker builder and
CI run npm 10.9.9, which cannot write v4.

## Proof gates

- Clean-reinstall proof is the standalone-installability gate - exactly what Docker and CI do:
  `rm -rf node_modules && npm ci` with zero "install scripts blocked" lines.
- A full lockfile regeneration rewrites the root `version` field to match package.json (0.0.0 ->
  0.4.0 in PR #152). That is an npm byproduct, not a hand fix, and `npm ci` accepts any match state
  (see the release-flow package-lock note in `docker-infra`) - do not hand-revert it.
