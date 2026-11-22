# Errors, Translated Messages and Settings

Part of the `django-backend` skill. Read before adding a domain exception, an error message, or an env-dependent setting.

## Error Handling

- **Domain Exceptions**: Services raise domain exceptions inheriting from `ServiceError` (in `common/exceptions.py`)
- **Global Handler**: A Django Ninja exception handler in `config/urls.py` converts `ServiceError` to HTTP responses automatically
- **Exception Types**: `NotFoundError` (404), `ValidationError` (400), `AuthenticationError` (401), `PermissionDeniedError` (403)
- **App Exceptions**: Each app defines specific exceptions in `<app>/exceptions.py`
- **Transactions**: Use `@db_transaction.atomic` whenever a service method performs more than one write (all of them commit or none do)
- **Exception Naming**: `<Domain><ErrorType>Error` - e.g., `TwoFactorNotEnabledError`. Always set `default_message` and `default_code` as class attributes
- **Exception Codes**: Every domain exception should include a `default_code` (snake_case string) for frontend error matching (e.g., `'two_factor_not_enabled'`)
- **DB check constraints mirror into the API surface:** the exception's `default_code` may deliberately equal the constraint name minus its table prefix (`materialize_all_requires_end` for constraint `recurring_materialize_all_requires_end`) so clients can correlate the 400 with the constraint that fired, and a check-constrained numeric range is mirrored as Create-schema `ge`/`le` (`upfront_count: Field(1, ge=1, le=24)` for `recurring_upfront_count_range`) so Pydantic 422s before the DB ever sees it.
- **Translatable by default:** `default_message` is `gettext_lazy`-wrapped; dynamic messages %-format into a wrapped msgid (see Error Messages Are Translated)

```python
# users/exceptions.py
from django.utils.translation import gettext_lazy

class TwoFactorNotEnabledError(NotFoundError):
    default_message = gettext_lazy('Two-factor authentication is not enabled for this user')
    default_code = 'two_factor_not_enabled'

# For exceptions with dynamic messages, accept params in __init__ and
# %-format into the wrapped msgid (never an f-string; see Error Messages Are Translated):
class UnknownCurrencyError(NotFoundError):
    default_code = 'unknown_currency'

    def __init__(self, code: str):
        super().__init__(gettext_lazy('Currency %(code)s not found in the catalog') % {'code': code})
```

**Disable/delete guards enumerate their blockers per type.** A guard that counts blocking references returns a per-type breakdown dict (`{'accounts': n, 'category_budgets': n, ...}`), not a summed int, and the exception composes the human-readable sentence from a locale-correct plural-label helper (`_reference_label(kind, count)` in `currencies/exceptions.py`: one `ngettext` branch per kind - literal msgid pairs so xgettext collects them - with unknown kinds falling back to the raw key). The sentence rides the existing `{'detail': ...}` handler channel, so the frontend renders it verbatim with zero client-side enumeration logic. Exemplar: `CurrencyInUseError`. Guard extensions are append-only: a new reference type joins `_reference_count` LAST and its `_reference_label` branch joins LAST (the helper's docstring contract) - dict iteration order drives sentence order, and inserting mid-order silently rewrites every pinned sentence assertion.

**A new reference kind joins the guard as a single-commit census across all its surfaces.** One commit touches: the count dict key and the label branch (both LAST, per the append-only rule above), the custom-row deletion guard in `disable()`, BOTH po catalogs (the new plural entry + any shifted `#:` refs), and BOTH docs enumerations (`docs/workflow.md`, `backend/README.md`) - never the count alone. The count is only the UX/blocking layer: a reference row created between the count and the custom-row delete (READ COMMITTED) still trips the PROTECT FK as `ProtectedError` (500), and any future FK the count misses has the same failure mode - the deletion-guard re-check is the correctness layer (see the pin rule below) that makes delete safe regardless of what the count saw. Regression tests assert the domain error where the 500 used to escape (`CurrencyInUseError`, never `ProtectedError`).

**An FK that does not gate an operation can still pin the row against its cleanup.** When un-blocking a guard (transaction original-currency facets stopped counting toward currency disable), check `on_delete` at every DELETION site, not just in the guard: `Transaction.original_currency` is `on_delete=PROTECT`, so the "orphaned" custom-row cleanup that now runs anyway would raise `ProtectedError` (500) on a facet-referenced row. The deletion site needs its own reference check - a facet-referenced row is not orphaned (it stays, re-enablable). Excluding a reference type from the guard NEVER means the row is safe to delete; it means the guard and the cleanup answer different questions. Deletion-guard reference queries are deliberately unscoped: a custom currency row belongs to exactly one workspace, and the guard protects the FK, not workspace visibility - do not "fix" them into `for_workspace(...)` filters.

## Error Messages Are Translated (gettext)

API error details are user-facing UI: every message that can reach the `{'detail': ...}` handler is translatable. Selection is request-driven - `LocaleMiddleware` (after SessionMiddleware) picks the catalog from the request's `Accept-Language` header (the frontend sends it on every request); no header, an unknown language, or a missing translation falls back to the English source string.

- **`<app>/exceptions.py` uses `gettext_lazy` throughout.** Class attributes are assigned at import time, so only a lazy proxy resolves the language at response time: `default_message = gettext_lazy('...')`, and dynamic constructors %-format the lazy msgid (`super().__init__(gettext_lazy('Currency %(code)s not found') % {'code': code})`).
- **Service raise sites and Pydantic validators use runtime `gettext` `_()`** - the same split as any other import-time vs. request-time evaluation: `raise ValidationError(_('Currency %(code)s not found') % {'code': code})`.
- **Placeholders in translatable messages are named %-format, never f-strings.** An f-string interpolates before gettext sees it, baking English word order into the message; the msgid must be one complete sentence.
- **Never name a partition/split throwaway `_` inside a function that calls gettext as `_`.** One assignment (`budget, _, cat = token.partition('::')`) makes `_` local to the ENTIRE function scope, so every earlier `_(...)` call in that function raises `UnboundLocalError` - in `import_all_data` the failure was every import 500ing at the version gate, dozens of lines before the new code, invisible to ruff and to a diff-reading reviewer. Use indexed reads on the partition tuple (`parts[0]`, `parts[2]`) or any non-`_` throwaway name.
- **Updating translations:** `uv run python manage.py makemessages -l uk -l pl --no-obsolete` regenerates `locale/<lang>/LC_MESSAGES/django.po`; translate the msgstrs, run `compilemessages` (the Docker entrypoints compile on boot; a gettext-absent host runs the same command through `./dev.sh manage makemessages ...`). The full workflow is in `docs/i18n.md`. For a small additive msgid change on a catalog carrying unrelated debt, hand-add the entries instead (correct `#:` refs, the `#, python-format` flag where placeholders exist, msgstr wrapping matching the file's style) - a full regen re-wraps hundreds of unrelated lines per catalog and buries the real change.
- **Scope: API error details only.** Emails and legal document text stay English by design (see the `email-sending` skill); do not gettext those.
- Testing translated responses (headers, fallback assertions) is in the `backend-testing` skill's Accept-Language pattern.

## Env-Mode Dispatch in settings.py

When `config/settings.py` selects between implementations via an env var (`EMAIL_MODE`: console/file/smtp), use a validated closed-set mode variable - never let arbitrary values flow into branch logic. Exemplar: the email block in `config/settings.py`, tested by `core/tests/test_settings_email.py`.

- **Lowercase before validating** (`os.getenv('EMAIL_MODE', '').lower()`) so `SMTP`/`File` are accepted, and treat unset/empty as the legacy auto behavior (`EMAIL_HOST` set means smtp, empty means console) - empty equals the pre-mode-var behavior, so no existing deployment changes on upgrade.
- **Fail loud at boot.** Every other value - including whitespace-only - raises `ImproperlyConfigured` at startup, naming the env var and listing the valid values. A silent fallback masks misconfiguration, and naming the var is what makes the failure assertable on stderr by the subprocess probe tests (see the `backend-testing` skill's probe section).
- **Sub-settings live inside their branch only.** `EMAIL_FILE_PATH` is assigned in file mode alone (undefined elsewhere), the SMTP `EMAIL_HOST`/`EMAIL_PORT`/`EMAIL_HOST_USER`/`EMAIL_HOST_PASSWORD`/`EMAIL_USE_TLS` cluster in smtp mode alone. A sub-setting assigned outside its branch leaks a half-configured mode into every other branch.
