---
name: backend-testing
description: Backend testing conventions for Owlgarth Finances (pytest, Factory Boy, AuthMixin, Celery tasks, on_commit, JWT expiry, subprocess probes for import-time settings). Use when writing or modifying tests in backend/, debugging test failures, or adding test coverage for services, endpoints, or tasks.
---

# Backend Testing Conventions

## Commands

```bash
cd backend
pytest                                    # Run all tests
pytest -v                                 # Verbose output
pytest transactions/tests.py              # Run specific app tests
pytest transactions/tests.py::TestClass::test_method  # Single test
pytest -k "test_create"                   # Run tests matching pattern
pytest --cov=. --cov-report=html          # With coverage
pytest --create-db -v                     # Fresh test DB (use when cross-branch migrations cause stale DB issues)
```

## Use Factories, Not Direct Creates or Service Calls

Use Factory Boy factories (e.g., `WorkspaceMemberFactory`) instead of direct `Model.objects.create()` calls. Factories exist in `<app>/factories.py` across the codebase.

Prefer factories over service calls for setup — service calls create extra side effects (enabled currencies, a Main account, a General budget, memberships) that make assertions unreliable:

```python
# Bad: service call creates a full workspace with demo fixtures
workspace = WorkspaceService.create_workspace(user=owner, name='Team')

# Good: factory creates only the records needed
workspace = WorkspaceFactory(name='Team')
owner = UserFactory(full_name='Owner', current_workspace=workspace)
WorkspaceMemberFactory(workspace=workspace, user=owner, role='owner')
```

Only use service calls when the test specifically validates service-level behavior (e.g. `test_delete_workspace_*` calling `WorkspaceService.delete_workspace` directly).

**Factory gotcha:** Factories for financial records (`TransactionFactory`, `TransferFactory`, `PlannedTransactionFactory`) default to creating their own `Account` (and its workspace) and `User` via `SubFactory`. When tests need records tied to a specific workspace/account, pass these explicitly:

```python
account = AccountFactory(workspace=self.workspace, name='Main', opening_balance=Decimal('100.00'))
transaction = TransactionFactory(
    account=account, workspace=self.workspace, amount=Decimal('50.00'), type='expense',
)
```

A transaction's currency **is** its account's currency — there is no separate
`currency` FK. Categories belong to a `Budget` (via `CategoryFactory(budget=...)`),
not to a period.

## AuthMixin

```python
from common.tests.mixins import AuthMixin, APIClientMixin
from django.test import TestCase

class TestTransactions(AuthMixin, APIClientMixin, TestCase):
    user_role = 'member'  # default: 'owner'; also: 'admin', 'viewer'

    def test_create_transaction(self):
        data = self.post('/api/transactions', payload, **self.auth_headers())
        self.assertStatus(201)
```

`AuthMixin` creates a bare workspace (via `WorkspaceFactory`), a user, and a workspace membership — it does **not** enable currencies or create accounts/budgets (that keeps assertions clean). Enable a currency and create accounts/budgets explicitly in `setUp` when the test needs them (e.g. `CurrencyCatalogService.enable(self.user, self.workspace.id, 'PLN')` then `AccountFactory(workspace=self.workspace)`). It also creates `auth_token` and provides `auth_headers()`. `self.user`, `self.workspace`, `self.auth_token` are available.

**Byte-streaming endpoints:** `APIClientMixin`'s `self.get` parses JSON only - success-path assertions on file bytes and headers (`response.content`, `response['Content-Disposition']`) use `self.client.get` directly, while error paths keep `self.get` + `assertStatus`. Exemplar: `TestAttachmentDownload` in `transactions/tests.py`.

**Workspace ambiguity:** When tests create additional workspaces for the same user (e.g., via `import_all_data`), filtering by `owner=self.user` alone may return the AuthMixin workspace instead of the new one. Filter by both `owner` and `name`:

```python
workspace = Workspace.objects.filter(owner=self.user, name='Imported Workspace').first()
```

**Authenticating as a different user:** `AuthMixin` only mints a JWT for `self.user`. Cross-user tests (same idempotency key under another user, viewer-role probes) mint one directly with `create_access_token(other_user)` from `common.auth` and send it as an explicit `Authorization: Bearer …` header instead of `self.auth_headers()`.

## Test Auth Without AuthMixin

For tests that need an authenticated user without workspace setup:

```python
from common.auth import create_access_token
from common.tests.factories import UserFactory

user = UserFactory(email='test@example.com', full_name='Test')
user.set_password('testpass123')
user.save()

token = create_access_token(user)
headers = {'HTTP_AUTHORIZATION': f'Bearer {token}'}
```

Avoid `User.objects.get()` queries in test setup — the factory already returns the user instance.

## Testing on_commit Callbacks

Django's `TestCase` wraps each test in a transaction, so `on_commit` callbacks don't fire until the test transaction ends. Patch it to execute immediately:

```python
from unittest.mock import patch
from django.db import transaction

def _immediate_on_commit(func, *args, **kwargs):
    func()

class TestMyFeature(TestCase):
    @patch.object(transaction, 'on_commit', side_effect=_immediate_on_commit)
    def test_sends_email(self, mock_on_commit):
        self.assertEqual(len(mail.outbox), 1)
```

Only patch `on_commit` for the specific tests that need it — never globally.

## Testing Token Expiry

On Python 3.13+, `datetime.datetime` is C-implemented and immutable — `patch('datetime.datetime.now', ...)` fails, and PyJWT uses `datetime.datetime.now(tz=timezone.utc).timestamp()` internally so patching `time.time` doesn't affect JWT decoding. Instead, craft a JWT with a past `exp` directly:

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

## Mocking Time in TTL Tests

The codebase does not use `freezegun` or `time_machine`. For expiry/TTL behavior, patch Django's clock directly and keep the patch around the whole request or call — both the lookup and the write usually consult `now()`:

```python
with mock.patch('django.utils.timezone.now', return_value=future):
    self.post('/api/transactions', payload, **self.auth_headers())
```

Patch the clock the code under test actually reads, at the module where it reads it: code that calls `time.time()` directly (e.g. TOTP timestep math in `users/two_factor.py`) never sees a `django.utils.timezone.now` patch — `mock.patch('users.two_factor.time.time', return_value=...)` is the fix, stepping the return value to cross window boundaries.

## Rate-Limit & Throttle Tests

- Rate-limit decorators capture `settings.RATE_LIMIT_*` at import (decoration) time — `override_settings` cannot change them. Write these tests against the configured defaults instead of trying to override.
- `APIClientMixin.setUp` clears the cache, so throttle counters are isolated per test.
- To assert the account-keyed (IP-independent) limit in isolation, rotate `REMOTE_ADDR` per request — otherwise a "no 429" assertion is ambiguous between the IP-keyed and account-keyed decorators stacked on the same endpoint.
- Test the boundary at the exact cap: N−1 failures followed by one success must succeed (`count > limit` blocks only above the limit — a lock must not fire AT the limit on a legitimate user).
- Exact attempt counts require exact auth traffic: create users directly (`AuthTestCase.create_user` or factory + token), not via helpers that themselves log in — `register_and_login` pre-increments the login counter.
- Unit-testing a throttle: `@patch('common.throttle.cache')` with `add`/`incr` return values, and assert the exact cache-key string — that is how "no IP component in the key" gets pinned.

## Testing Import-Time Settings Branches (Subprocess Probe)

`config.settings` builds some settings at import time from env vars (e.g. STORAGES from `USE_S3_STORAGE` / `S3_*`), and pytest runs under `config.test_settings`, which forces `USE_S3_STORAGE=False` - those branches are unreachable in-process, and `override_settings` cannot help: the value is already built by the time a test imports Django. Exercise the real settings module in a subprocess with a controlled environment (reference implementation: `core/tests/test_settings_storage.py`):

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
- Keep the probe network-free: with `custom_domain` set, django-storages `url()` is pure string formatting, so asserting through `staticfiles_storage.url(...)` needs no storage containers in CI.

## Testing Race-Loss Branches Deterministically

A true concurrent race can't be simulated inside `TestCase`. To exercise a unique-constraint `IntegrityError` handler (see the savepoint pattern in the `django-backend` skill): (1) pre-commit the winner's record directly — it lives in the test's outer transaction, so it survives the code's savepoint rollback; (2) mock the lookup to lose the race — capture the real function first, then force `None` on the first call (insert path) and delegate to the real lookup after the error:

```python
real = TransactionService._lookup_idempotency_key
with mock.patch.object(
    TransactionService, '_lookup_idempotency_key', side_effect=[None, real]
):
    ...
```

When a private helper's signature changes, grep its test doubles in the same task — `side_effect=fake` stubs must widen with the real method's parameters.

## Testing Celery Tasks

Test settings use `CELERY_TASK_ALWAYS_EAGER=True`, so `.delay()` executes synchronously — no worker needed. Call tasks directly (`execute_planned_transaction(planned_id)`) instead of via `.delay()` for clearer error messages. After dispatching a task in a test, call `instance.refresh_from_db()` to pick up changes the synchronous task made.

Use a three-class structure:

1. **Direct task invocation** — call the task function directly, assert side effects
2. **Service-level dispatch** — call the service method, verify the task executed (works because of `ALWAYS_EAGER`)
3. **Configuration validation** — assert task attributes match expected retry config

```python
class TestSendEmailTaskDirect(TestCase):
    def test_sends_email(self):
        send_email_task(['user@example.com'], 'Test', 'email/test', {})
        self.assertEqual(len(mail.outbox), 1)

class TestEmailServiceDispatch(TestCase):
    def test_dispatches_task(self):
        result = EmailService.send_email(['user@example.com'], 'Test', 'email/test', {})
        self.assertTrue(result)

class TestTaskConfig(TestCase):
    def test_retry_config(self):
        self.assertEqual(send_email_task.max_retries, 3)
        self.assertEqual(send_email_task.autoretry_for, (Exception,))
        self.assertTrue(send_email_task.retry_backoff)
```

## Deleting a Workspace in Tests

Direct `workspace.delete()` raises `ProtectedError` — accounts are PROTECT-referenced by transactions, transfers, and planned transactions. Do what production does (`UserService.delete_account`, `WorkspaceService.delete_workspace`): call `delete_workspace_financial_records(workspace_id)` first (deletion ordering is in the `data-deletion-gdpr` skill).

## New Optional Schema Field: Five-Test Shape

Cover a newly added optional schema field with one test class: (1) positive case with ordered values, (2) backward-compat — field omitted, (3) explicit empty collection, (4) `max_length` rejection — asserts 422 straight from Pydantic `ValidationError`, no DB hit, (5) the cross-cutting invariant the field could violate (e.g. items must not influence the authoritative `amount`/balance). This shape catches schema, service, and invariant regressions together.

## Behavior Changes Rewrite Their Tests

When a task deliberately changes a behavior, the tests pinning the OLD behavior are part of the change, not optional cleanup — rewrite them in the same task and grep the old test names to confirm none survive (the trusted-proxy change rewrote three tests that asserted first-hop XFF parsing). A test left asserting the old behavior either breaks CI later or gets "fixed" by reverting the behavior.

## Email in Tests

`EMAIL_BACKEND` is set to `django.core.mail.backends.locmem.EmailBackend` via `config/test_settings.py`. Use `mail.outbox` to inspect sent emails.

For flows that send email on success, give each failure-path test its own `assertEqual(len(mail.outbox), 0)` next to its status assertion — a future guard reorder that starts emailing before validation then fails that specific path's test, not a distant aggregate. Two counting details:
- A delivered email proves both templates rendered — eager Celery's `send_email_task` renders `.txt` and `.html` before sending, so `len(mail.outbox) == 1` plus a body assertion covers "template exists, context vars present" without a render-to-string test.
- `on_commit` emails never fire in `TestCase`, so on an early-return path the only outbox entry is the direct-send email — `len(mail.outbox) == 1` is exact without patching.
