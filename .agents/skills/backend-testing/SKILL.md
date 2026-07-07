---
name: backend-testing
description: Backend testing conventions for Denarly (pytest, Factory Boy, AuthMixin, Celery tasks, on_commit, JWT expiry). Use when writing or modifying tests in backend/, debugging test failures, or adding test coverage for services, endpoints, or tasks.
---

# Backend Testing Conventions

## Commands

```bash
cd backend
pytest                                    # Run all tests
pytest -v                                 # Verbose output
pytest budget_accounts/tests/             # Run specific app tests
pytest budget_accounts/tests/test_api.py::TestClass::test_method  # Single test
pytest -k "test_create"                   # Run tests matching pattern
pytest --cov=. --cov-report=html          # With coverage
pytest --create-db -v                     # Fresh test DB (use when cross-branch migrations cause stale DB issues)
```

## Use Factories, Not Direct Creates or Service Calls

Use Factory Boy factories (e.g., `WorkspaceMemberFactory`) instead of direct `Model.objects.create()` calls. Factories exist in `<app>/factories.py` across the codebase.

Prefer factories over service calls for setup — service calls create extra side effects (currencies, budget accounts, memberships) that make assertions unreliable:

```python
# Bad: service call creates a full workspace with demo fixtures
workspace = WorkspaceService.create_workspace(user=owner, name='Team')

# Good: factory creates only the records needed
workspace = WorkspaceFactory(name='Team')
owner = UserFactory(full_name='Owner', current_workspace=workspace)
WorkspaceMemberFactory(workspace=workspace, user=owner, role='owner')
```

Only use service calls when the test specifically validates service-level behavior (e.g. `test_delete_workspace_*` calling `WorkspaceService.delete_workspace` directly).

**Factory gotcha:** Factories for financial records (`TransactionFactory`, `PlannedTransactionFactory`, `CurrencyExchangeFactory`) default to creating their own `BudgetPeriod` and `User` via `SubFactory`. When tests need records tied to a specific workspace/account/period, pass these explicitly:

```python
period = BudgetPeriodFactory(
    budget_account=account, start_date='2025-01-01', end_date='2025-01-31', created_by=self.user,
)
pln = self.workspace.currencies.get(symbol='PLN')
transaction = TransactionFactory(
    budget_period=period, currency=pln, created_by=self.user, updated_by=self.user,
)
```

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

`AuthMixin` creates a workspace with PLN+USD currencies (via `WorkspaceFactory`), a user, a workspace membership, and a default "General" `BudgetAccount`. It also creates `auth_token` and provides `auth_headers()`. `self.user`, `self.workspace`, `self.auth_token` are available.

**Workspace ambiguity:** When tests create additional workspaces for the same user (e.g., via `import_all_data`), filtering by `owner=self.user` alone may return the AuthMixin workspace instead of the new one. Filter by both `owner` and `name`:

```python
workspace = Workspace.objects.filter(owner=self.user, name='Imported Workspace').first()
```

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

## Email in Tests

`EMAIL_BACKEND` is set to `django.core.mail.backends.locmem.EmailBackend` via `config/test_settings.py`. Use `mail.outbox` to inspect sent emails.
