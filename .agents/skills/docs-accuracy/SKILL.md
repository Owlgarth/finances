---
name: docs-accuracy
description: Documentation editing conventions for Owlgarth Finances - accuracy sweeps (verify claims against source, census-before-edit, grep-gated done criteria, dead names to zero, anchor links, terminology mirroring of described sources) and markdown mechanics (code-fenced tree alignment, repr() whitespace verification, verbatim transcription, non-dash glyph preservation). Use when editing any README.md, docs/ or design/ markdown, or when running a documentation accuracy or audit sweep.
---

# Documentation Accuracy

The repo's docs (root `README.md`, `backend/README.md`, `frontend/README.md`, `docs/*`, `design/*`) describe code that keeps drifting. Two disciplines keep them trustworthy: every claim is verified against the source it describes (never against the old doc or the spec), and every edit is mechanically safe (whitespace, glyphs, pinned text). Doc riders - a doc paragraph whose semantics a code task changes - ride that code task, never a separate docs-only commit (rule lives in django-backend).

## Accuracy Sweeps

### Verify Against Source, Not the Old Doc

- Endpoint tables are built from the actual decorators (`@router.post`, `auth=JWTAuth()`, `@rate_limit*` layers) in the `api.py` source, not from the previous table - a blanket "all auth endpoints are unauthenticated" claim fell to one decorator check.
- Every documented symbol (component, hook, route, management command, env var, endpoint) is grepped for existence before it enters a doc. A ghost name sends readers hunting for code that is not there.
- A spec's discrepancy report can be stale - re-verify each "missing" claim against the file before editing (one audit listed 4 items the README already documented). The spec describes the file as the auditor saw it, not as it landed.
- Docs that summarize sibling docs mirror their vocabulary exactly and describe their landed state: re-read the sibling's landed file, never the spec's pre-landing guess, and never coin a synonym - if backend/README.md says "2FA temp token", the summary row says "refresh and 2FA temp tokens", not "2FA login tokens".
- Mirror a canonical authority (e.g. `docs/workflow.md` for workflow detail) with a pointer instead of forking its content; assert no number, TTL, or default the source does not pin.

### Dead Code Stays Undocumented

Components with zero imports, dead endpoints, and removed helpers are grep-gated to zero mentions in the final file (`Loading.tsx`, `ErrorMessage.tsx`, `SortableTh.tsx`, `decode_access_token` were the gated names). Documenting removal-backlog code re-rots the doc the day the backlog is executed.

### Census Before Edit, Grep-Gated Done

- Run every done-criterion grep BEFORE editing: it catches occurrences the spec's line numbers missed, proves which sections are already clean, and separates real work from already-done work.
- Done criteria are greps over the final file: required strings present, dead names to zero, em-dash count unchanged from baseline.
- `grep -c` counts lines; when the criterion is "zero refs", count occurrences (`grep -o ... | wc -l`) - one line can carry two tokens of the dead name. The same line-vs-token split resolves pin discrepancies the other way: when a gate pins a token COUNT (`grep -c EMAIL_MODE` = 3), a paragraph carrying two tokens on one physical line legitimately soft-wraps to meet it (single newlines are still one Markdown paragraph, sentence count intact). Wrapping to satisfy a line-count gate is mechanical; rewording content to inflate a count is gaming - never edit meaning to satisfy a gate.
- A grep gate tests contiguous text: if a gated phrase ("Start with sample data") lands split across a line break, re-wrap within the file's width (~78 chars) so the phrase is contiguous.
- General grep-gate mechanics - gates count comment text, exact-case identifiers, spec-vs-measure disagreements, pre-existence proofs - live in frontend-react's "Grep/lint done-criteria gates" rule; same discipline, code side.

### Links Are Anchors, Never Line Numbers

Anchor-based relative links (`../../backend/README.md#legacy-import-pre-redesign-data`) survive target drift - a heading moved from line 334 to 336 and the anchor link stayed valid where a line reference would have silently broken. Keep heading text stable when other docs anchor into it.

## Markdown Mechanics

### Code-Fenced Trees

- Count column positions before writing new rows or continuations - alignment is byte-consistent with the neighbors or the tree renders crooked.
- Verify leading whitespace with `repr()`, never by eye: the Read tool's display and spec snippets can both show `   │   │   ├──` prefixes the file does not have (its tree starts at column 0), and edit tools fuzzy-match leading whitespace while writing newStrings literally - three spurious spaces leaked into nine tree lines once and needed an assertion-checked script to repair. The fence's indentation in a spec or a rendered diff is display chrome, not file content:

```
frontend/
│   ├── components/      # column 0 - the file's actual tree
```

- A pinned tree comment that would run far past the tree's width (~115 chars against a ~50-char max) takes the spec's sanctioned short form; the detail moves to the prose/overview row.
- Pinned line lengths get the same script verification, whatever the file type: an authored line whose width is pinned - an env-template section header (root `example.env` pads `# --- Title ` + dashes to exactly 80 chars, `prod/.env.example` to 84) or a column-aligned fence row - is generated and length-checked with a Python one-liner BEFORE it lands in the file, never authored by eye and checked later.

### Verbatim Transcription

- When a plan pins doc content exactly, transcribe it character-for-character - including `×` (U+00D7) and `≠` (U+2260), which look like forbidden special chars but are NOT dashes; the ban covers U+2014/U+2013 only.
- Spec-verbatim fragments stay byte-identical through paragraph rewrites: rebuild the surrounding prose, never re-type the pinned fragment. A balanced diff (equal insertions/deletions) proves nothing was reflowed.
- When a spec's prose disagrees with its own fenced content or its gate commands, the fence/gate wins: prose said "15-line block" while the spec's own fence enumerated 16 - transcribe the fence verbatim (no gate counts lines). The fenced content is the pinned intent; the prose around it is only a description.

### Glyphs and Dashes

- Pre-existing non-dash glyphs (`→`, `·`, `…`, box-drawing `│ ├ └`) are legitimate - preserve them; do not "clean them up" to ASCII.
- An edited line that CARRIES a pre-existing dash re-emits it in its `+` twin, so `git diff -U0 | grep -P '^\+.*\x{2014}'` flags correct edits too - the authoritative gate is added=removed dash-line counts plus per-file dash-count equality before/after.
- For `.md` files, `git diff --stat` insertions/deletions equality is the authoritative balance gate: `git diff | grep -cE "^[+-][^+-]"` undercounts markdown because changed list lines render as `--`/`+-` and fail the second-char guard (returned 24 vs 30 on one sweep).
- Better than balancing glyph lines: anchor the edit so glyph-carrying lines never enter the diff at all. Anchor on a unique adjacent line pair instead of the glyph line itself, and keep edit-boundary lines byte-identical in oldString/newString so git renders them as context, not -/+ pairs - a prod env-template insertion anchored on the `EMAIL_HOST=`/`EMAIL_PORT=587` pair so an 84-char dash header never became a diff line, keeping the dash-count gate trivially clean.
