# Specialized Test Techniques

Part of the `backend-testing` skill. Read when a test needs time control, token expiry, rate limits, translated errors, import-time settings branches, race-loss branches, DB check constraints, query-count invariance, data-migration functions, or a dry run against real dev data.

## Testing Token Expiry

On Python 3.13+, `datetime.datetime` is C-implemented and immutable - `patch('datetime.datetime.now', ...)` fails, and PyJWT uses `datetime.datetime.now(tz=timezone.utc).timestamp()` internally so patching `time.time` doesn't affect JWT decoding. Instead, craft a JWT with a past `exp` directly:

```python
import datetime as dt
import jwt
from django.conf import settings

now = dt.datetime.now(dt.timezone.utc)
payload = {
    'user_id': str(user.id),
    'type': 'refresh',
    'jti': str(uuid.uuid4()),
    'iat': (now - dt.timedelta(days=8)).timestamp(),
    'exp': (now - dt.timedelta(days=1)).timestamp(),
}
expired_token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
```

Assert the error `detail` message, not just the 401 status: adjacent auth branches (expired token vs invalid code) both return 401, and only the message pins which branch rejected. A mutation check - minting the same token with a future `exp` flips the test to the other branch's message - proves the discrimination.

## Mocking Time in TTL Tests

The codebase does not use `freezegun` or `time_machine`. For expiry/TTL behavior, patch Django's clock directly and keep the patch around the whole request or call - both the lookup and the write usually consult `now()`:

```python
with mock.patch('django.utils.timezone.now', return_value=future):
    self.post('/api/transactions', payload, **self.auth_headers())
```

Patch the clock the code under test actually reads, at the module where it reads it: code that calls `time.time()` directly (e.g. TOTP timestep math in `users/two_factor.py`) never sees a `django.utils.timezone.now` patch - `mock.patch('users.two_factor.time.time', return_value=...)` is the fix, stepping the return value to cross window boundaries.

## Rate-Limit & Throttle Tests

- Rate-limit decorators capture `settings.RATE_LIMIT_*` at import (decoration) time - `override_settings` cannot change them. Write these tests against the configured defaults instead of trying to override.
- `APIClientMixin.setUp` clears the cache, so throttle counters are isolated per test.
- To assert the account-keyed (IP-independent) limit in isolation, rotate `REMOTE_ADDR` per request - otherwise a "no 429" assertion is ambiguous between the IP-keyed and account-keyed decorators stacked on the same endpoint.
- Test the boundary at the exact cap: N−1 failures followed by one success must succeed (`count > limit` blocks only above the limit - a lock must not fire AT the limit on a legitimate user).
- Exact attempt counts require exact auth traffic: create users directly (`AuthTestCase.create_user` or factory + token), not via helpers that themselves log in - `register_and_login` pre-increments the login counter.
- Unit-testing a throttle: `@patch('common.throttle.cache')` with `add`/`incr` return values, and assert the exact cache-key string - that is how "no IP component in the key" gets pinned.

## Accept-Language and Translated Error Tests

Backend error messages are selected per request from the `Accept-Language` header (`LocaleMiddleware`), so translated responses are testable with plain client headers - no translation activation needed. `APIClientMixin`'s helpers forward `**kwargs` to the Django test client, and request headers ride the same `HTTP_*` kwarg convention as `auth_headers()`:

```python
detail = str(self.patch('/api/users/me/preferences', {'calendar_start_day': 13},
                        **self.auth_headers(), HTTP_ACCEPT_LANGUAGE='pl')['detail'])
```

Translated assertions need compiled catalogs: guard the class with `@unittest.skipUnless(shutil.which('msgfmt'), 'gettext not installed')` and compile in `setUpClass` via `call_command('compilemessages', verbosity=0)` - without .mo files the translated assertions fail by design. Exemplar: `TestPreferencesMessageLocalization` in `users/tests/test_users.py`.

- **No header = English fallback.** Every pre-existing test that asserts an error `detail` already pins this path (source msgid string); an unknown language (`xx`) negotiates to English and a partial tag (`uk-UA`) resolves to the `uk` catalog - one boundary test each is enough.
- **Assert the exact translated msgstr**, not just "not the English string" - a partial overlap (shared prefix, punctuation-only difference) passes a negative assertion while proving nothing about selection. Keep the msgid English in code and pin the expected Ukrainian/Polish sentence in the test.
- A request can assert BOTH the error status and the language selection in one call; do not burn a second request re-triggering the same error for the translation assertion.
- **Behavior tests never pin msgid TEXT - that is this section's concern, inverted.** A test verifying service behavior (return-dict shape, which role was rejected, which error class) around a gettext-translated message asserts the translation-independent contract instead: dict key sets (`set(result) == {'message'}`), untranslated sibling values (`user_id`, `email`), interpolated placeholder values (`assertIn('owner', ...)` - named `%(...)s` placeholders survive in every catalog), and the exception class's `http_status`. The failure mode: in a full in-container run, compiled `.mo` catalogs plus an ordering-level locale leak can activate a non-English catalog at the moment a message is gettext-resolved - the English msgid-text assertion then fails only there, and chasing the leak activator is fragile; the locale-independent assertions pin the same behavior under any catalog. Mark each converted block with a `# Locale-independent:` comment. Exemplars: `workspaces/tests/test_services.py`'s hardened tests.

## Testing Import-Time Settings Branches (Subprocess Probe)

`config.settings` builds some settings at import time from env vars (e.g. STORAGES from `USE_S3_STORAGE` / `S3_*`, the email backend from `EMAIL_MODE`), and pytest runs under `config.test_settings`, which forces `USE_S3_STORAGE=False` and the locmem backend - those branches are unreachable in-process, and `override_settings` cannot help: the value is already built by the time a test imports Django. Exercise the real settings module in a subprocess with a controlled environment (reference implementations: `core/tests/test_settings_storage.py` - single-value probe; `core/tests/test_settings_email.py` - multi-attribute probe that also asserts failure modes):

```python
BACKEND_DIR = Path(__file__).resolve().parents[2]

_PROBE = (
    'import django; django.setup(); '
    'from django.contrib.staticfiles.storage import staticfiles_storage; '
    "print(staticfiles_storage.url('admin/css/base.css'))"
)

def _static_url(env_overrides: dict) -> str:
    env = {
        'DJANGO_SETTINGS_MODULE': 'config.settings',
        'SECRET_KEY': 'test-secret-key',
        'JWT_SECRET_KEY': 'test-jwt-secret-key',
        'S3_BUCKET_STATIC': 'finances-static',  # pin every var the output depends on
        **env_overrides,
    }
    result = subprocess.run(
        [sys.executable, '-c', _PROBE], capture_output=True, text=True,
        timeout=60, cwd=BACKEND_DIR, env=env,
    )
    assert result.returncode == 0, f'probe failed:\n{result.stderr}'
    return result.stdout.strip()

class TestStaticStorageUrlScheme(SimpleTestCase):  # no DB - AuthMixin/factories don't apply
    def test_http_dev_url(self):
        url = _static_url({'USE_S3_STORAGE': 'true', 'S3_EXTERNAL_URL': 'http://localhost:9000'})
        self.assertTrue(url.startswith('http://localhost:9000/finances-static/'))
```

- The subprocess env is a **whitelist, not a base layer**: pin EVERY env var the asserted output depends on, not just the var under test. `load_dotenv()` at settings import fills unset vars from the developer's root `.env` (a checkout-specific `S3_BUCKET_STATIC` shadowed the expected URL prefix mid-assertion); an unpinned var makes the test pass only where the local `.env` happens to match.
- **Empty-string pins are load-bearing.** Pinning a var to `''` is the hermetic way to express "no value": `load_dotenv()` never overrides vars already present, so `''` beats any root `.env` value, while an omitted var hands the test's outcome to the developer's `.env`. The email probe pins `EMAIL_MODE`/`EMAIL_HOST`/`EMAIL_FILE_PATH` all to `''` in its base env - and the settings module must treat `''` as unset (`os.getenv(...) or default`) for the two behaviors to interlock.
- **Multi-attribute probes map printed "None" back to Python None.** Print each asserted attribute with `getattr(settings, 'NAME', None)` and map the literal `None` lines back (`[None if line == 'None' else line for line in stdout.splitlines()]`) so tests can `assertIsNone` on attributes the settings module never defines.
- **Know which asserted settings carry Django global defaults.** `EMAIL_HOST` defaults to `'localhost'` in Django's global settings while `EMAIL_FILE_PATH` has none - assert a module-set attribute only in the branch that sets it; outside that branch a global default masks "module didn't set it" behind a plausible-looking value (console/file tests must not assert the host line).
- **Failure modes assert on stderr.** A validated settings module crashes the probe interpreter on bad input - assert `returncode != 0` plus the env var name in `stderr` (this is why the `ImproperlyConfigured` message must name the env var; see the env-mode dispatch pattern in the `django-backend` skill).
- Keep the probe network-free: with `custom_domain` set, django-storages `url()` is pure string formatting, so asserting through `staticfiles_storage.url(...)` needs no storage containers in CI. Keep it disk-free too: the filebased email backend only writes on an actual send, and `test ! -e backend/sent-emails` after the suite pins that neither the tests nor the probe created anything. Dev artifact dirs like `sent-emails/` are gitignored and never pre-created (no `.gitkeep`) - the backend creates the dir on first real send.

## Testing Race-Loss Branches Deterministically

A true concurrent race can't be simulated inside `TestCase`. To exercise a unique-constraint `IntegrityError` handler (see the savepoint pattern in the `django-backend` skill): (1) pre-commit the winner's record directly - it lives in the test's outer transaction, so it survives the code's savepoint rollback; (2) mock the lookup to lose the race - capture the real function first, then force `None` on the first call (insert path) and delegate to the real lookup after the error:

```python
real = TransactionService._lookup_idempotency_key
with mock.patch.object(
    TransactionService, '_lookup_idempotency_key', side_effect=[None, real]
):
    ...
```

When a private helper's signature changes, grep its test doubles in the same task - `side_effect=fake` stubs must widen with the real method's parameters.

## Testing DB Check Constraints Directly

A model-level check constraint (not reachable through the API, which 422s first via the mirrored schema bounds - see `django-backend`) is testable service-side with factory creates wrapped in a per-case savepoint:

```python
for bad in (0, 25):
    with self.assertRaises(IntegrityError):
        with db_transaction.atomic():  # SAVEPOINT - isolates the rollback
            RecurringTransactionFactory(workspace=self.workspace, upfront_count=bad)
self.assertEqual(RecurringTransaction.objects.count(), 0)
```

The nested `atomic()` is load-bearing: the `IntegrityError` poisons the TestCase's outer transaction (every later query would raise `TransactionManagementError`), and the savepoint rollback keeps the test usable. A trailing count pins that the poisoned creates stored nothing.

## Query-Count Invariance (CaptureQueriesContext)

Pin "the query count does not scale with N" with two `CaptureQueriesContext` runs compared to EACH OTHER - never a fixed `assertNumQueries(N)`. The absolute count includes JWT-auth and middleware queries whose internals change independently of the code under test, so a pinned number fails on unrelated refactors while proving nothing about the code it claimed to cover; the INVARIANCE is the contract the endpoint owns. Exemplar: `TestFrequentDescriptionsLastValues` in `transactions/tests.py` captures counts at `limit=1` vs `limit=6` and asserts equality - the endpoint's query count is constant in `limit` and in the number of groups (the window-function pattern in the `django-backend` skill).

## Testing Data-Migration Functions (Direct Call)

A `RunPython` function is testable by calling it directly against seeded rows - `func(django.apps.apps, schema_editor=None)` - which bypasses the migration recorder BY DESIGN: the test proves the function's effect on rows, not Django's migration-state machinery. The migration module loads via `importlib.import_module` because the file name (`0012_transactionitem_coverage_repair`) starts with a digit and is not a valid identifier.

- Pass the real `django.apps.apps`; `schema_editor=None` is safe whenever the function only uses `apps.get_model` (data migrations do).
- Pin idempotence with a snapshot equality: `values_list` over the pk plus every mutated-relevant field, run the function a SECOND time, compare - a repair migration that re-creates rows on a second pass fails here, not in production.
- Seed every branch the migration distinguishes (create/resize/delete/no-op cases), including the rows the original backfill never saw, and count-pin fixtures before looping row assertions so a fixture change fails loudly instead of the loop passing vacuously.

## Dry-Run Harness: Destructive Services Against Real Dev Data

To validate destructive or importing service code against real data (e.g. a user-reported malformed GDPR import file) without persisting anything, run the REAL service inside an outer `atomic()` that is always unwound by raising a marker exception at the end: the service's own `atomic()` becomes a savepoint, the marker exception rolls back everything including it, and a zero-persistence check afterward proves the unwind. Inspect intermediate state (verification-report counts, created rows) before raising the marker. The rollback unwinds only DB work - side effects outside the transaction (storage writes, emails, broker dispatches) are NOT undone; point those at throwaway targets or assert before unwinding. This is a manual-harness pattern for the dev database, not a pytest shape - `TestCase` already gives actual tests these semantics for free.
