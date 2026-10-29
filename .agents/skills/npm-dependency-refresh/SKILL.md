---
name: npm-dependency-refresh
description: Frontend npm dependency refreshes for Owlgarth Finances - audit-fix/update/audit-fix end-state sequencing, allowScripts derivation from the post-update tree, the lockfileVersion 3 gate, floor bumps for production-security direct deps vs backlog majors, registry-verified floors and lockfile diff-scope proof for single-package bumps, clean-reinstall proof. Use when refreshing or bumping frontend dependencies in frontend/package.json, triaging npm audit findings or a CI audit-gate failure, or regenerating frontend/package-lock.json.
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

## Single-package range bumps: pin the floor live, prove the diff scope

- The range floor comes from the LIVE registry, queried before the manifest edit:
  `npm view <pkg> version`, and the new floor equals its output. A floor copied from a plan
  snapshot is a date-of-planning value - `latest` moves, and a stale floor either fails to
  resolve the intended line or forces a second bump. When `latest` has already crossed the
  target major line, take the newest version of the TARGET major from
  `npm view <pkg> versions --json` instead of riding to the newer major.
- Prove the lockfile diff scope with a registry-URL grep, not eyeballing:
  `git diff -- frontend/package-lock.json | grep '^[+-]' | grep 'registry.npmjs.org'` must list
  exactly the expected package pairs (a @types/node major's complete collateral is itself plus its
  one transitive undici-types - 4 lines, 2 packages). A third package's URL in the diff means the
  tree moved unexpectedly: the change under review is not the change that was specced. Pair it
  with `git diff -U0 -- package.json | grep -c '^[+-][^+-]'` == 2 for the manifest itself.

## Subtree swaps: prove scope with a (key, version)-set diff

The URL-line diff above is the right gate for single-package bumps, but a whole-subtree swap (the tailwind 3 -> 4 CSS-first migration: 49 key@version pairs out, 33 in) breaks it: npm's traversal order moves UNRELATED entries - same key, same version - and git renders the relocation as `-`/`+` pairs, so the URL grep reports change where nothing semantically changed. For a swap, prove the semantic scope with a (key, version)-SET comparison: extract every `node_modules/<key>@<version>` pair from the old and new lockfiles, diff the sets, and account for every added/removed pair on the expected-collateral list. Expect SECOND-level collateral (`detect-libc` via lightningcss, `tapable` via enhanced-resolve in the tailwind 4 swap), and remember that dropping a direct manifest entry does not remove a package that stays transitive - browserslist/caniuse-lite/baseline-browser-mapping survived via `@babel`, postcss/picocolors via vite, after our direct entries left `package.json`. The version-graded mirror image also holds: a hoisted top-level copy leaves while nested per-consumer copies stay (PR #179: picomatch@2.3.2's top-level hoist left with the departing i18next-parser chain while vite's nested 4.0.7 and tinyglobby's copy survived) - same-package partial survival via other parents is correct, not leakage needing a proof.

When the swap exchanges the bundler ENGINE itself (vite 7 -> 8 traded Rollup+esbuild for Rolldown+Oxc), build the expected-collateral list from the departing AND arriving engine's FULL `optionalDependencies` closure: platform children carry foreign names, so a name-prefix filter on the engine's own family under-enumerates them and the set-diff flags them as suspicious outside-filter pairs - @napi-rs/lzma left via rollup's WASM-lzma platform child, @oxc-project/types arrived via rolldown's exact-pinned types (both real, both second-level, in PR #177). Every pair outside the expected list gets a reverse-dependency-map proof - who depends on it, through what chain (`npm ls <pkg> --all`) - before acceptance.

## allowScripts: derive from the live post-update tree

- Derive `allowScripts` from the actual post-update tree (`npm install-scripts ls`, plus
  `npm ls <pkg> --all` for nested duplicates - the tree carried two live esbuild instances, 0.25.12
  via i18next-parser and 0.28.2 via vite), never from spec predictions: versions move during the
  update, so a predicted entry set pins stale versions.
- `npm install-scripts approve <pkg>` ADDS an entry; it does NOT prune stale ones (npm 12, PR #179: after approve added `@swc/core`, the departed `esbuild@0.25.12` entry survived until the separate `npm install-scripts prune` removed it). The derivation sequence is `ls` -> `approve` -> `prune`, and the end state is verified by reading package.json's `allowScripts` block directly - never assumed from a subcommand's success.
- Prebuilt-binary platform packages ship NO install scripts and add no allowScripts entries: `@esbuild/*` always did, under tailwind 4 `@tailwindcss/oxide` + its platform children and `lightningcss` + its platform children behave the same way, and post-PR-#179 so do `@swc/core`'s 12 platform children - only `@swc/core` itself carries a postinstall (it is the sole allowScripts entry).
- The `.npmrc allow-scripts setting is being ignored` warning is ENVIRONMENTAL (user-level config
  on dev machines only); CI and Docker never see it. The gated warning is only "N package has
  install scripts blocked".

## lockfileVersion 3 is a hard gate

After any npm run that rewrites `frontend/package-lock.json`, verify `lockfileVersion: 3` in the
file. Since the node-26 alignment (PR #171) every lockfile surface writes v3 natively - npm 9+
does - so the gate no longer guards a cross-version writer/consumer asymmetry: the host and CI
(setup-node 26) run npm 12, while the Docker node images (`node:26-alpine` builder,
`node:26-slim` tools service) bundle npm 11.20.0 (node images carry upstream's bundled npm, not
this repo's choice - the 11/12 spread persists until upstream bundles 12). What the gate guards
now is npm itself changing its default lockfile format: a v4 default would land on the lockfile
regardless of which surface's npm writes it. If v4 ever appears, the remediation is re-locking
with an npm that still writes v3 - never bumping a consuming surface's npm to a v4 writer.

## Proof gates

- Clean-reinstall proof is the standalone-installability gate - exactly what Docker and CI do:
  `rm -rf node_modules && npm ci` with zero "install scripts blocked" lines.
- A full lockfile regeneration rewrites the root `version` field to match package.json (0.0.0 ->
  0.4.0 in PR #152). That is an npm byproduct, not a hand fix, and `npm ci` accepts any match state
  (see the release-flow package-lock note in `docker-infra`) - do not hand-revert it.
