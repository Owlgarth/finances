---
name: celery-tasks
description: Celery task conventions for Denarly — task structure, retry semantics, idempotency guards, service-to-task dispatch, circular import avoidance. Use when creating or modifying Celery tasks (<app>/tasks.py) or wiring background jobs into services.
---

# Celery Task Conventions

Celery tasks live in `<app>/tasks.py` using `@shared_task`. `config/celery.py` calls `autodiscover_tasks()` after Django is fully set up, so module-level imports of Django models are safe — do not use function-body imports (except for the circular-import case below).

## Tasks Delegate to Services

**Tasks must delegate DB operations to service classes.** Never use `Model.objects.create()` or direct ORM writes in a task — call the corresponding service method. Tasks are a transport layer, not a business logic layer:

```python
@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    max_retries=3,
    retry_backoff=True,
)
def execute_planned_transaction(self, planned_id):
    planned = PlannedTransaction.objects.filter(id=planned_id).first()
    if not planned or not planned.payment_date:
        return  # Permanent failure — no point retrying
    if planned.transaction_id:
        return  # Already processed (idempotency fast path)
    # ... transient checks that raise domain exceptions for retry ...
    TransactionService.update_period_balance(...)
```

## Dispatch Pattern

Call `task.delay()` directly at call sites — no wrapper methods. Import the task at module level in `services.py`:

```python
from planned_transactions.tasks import execute_planned_transaction

class PlannedTransactionService:
    @staticmethod
    @db_transaction.atomic
    def execute(user, workspace_id, planned_id):
        # ... validation, status update to 'done' ...
        execute_planned_transaction.delay(planned.id)
```

**Service-to-task dispatch:** When a service method enqueues a task, keep the synchronous logic in a private `@staticmethod` (e.g., `_send_sync()`) and make the public method a thin dispatcher that calls `.delay()`:

```python
class EmailService:
    @staticmethod
    def send_email(to, subject, template_name, context):
        # Import inside method body to avoid circular imports (tasks.py → email.py → tasks.py)
        from common.tasks import send_email_task

        to = [to] if isinstance(to, str) else to
        send_email_task.delay(to, subject, template_name, context)
        return True

    @staticmethod
    def _send_sync(to, subject, template_name, context):
        """Actual synchronous logic — called by the task."""
```

**Circular import avoidance:** When a service and its task are in the same module chain (e.g., `common/tasks.py` imports from `common/email.py`), import the task inside the method body, not at module level.

## Retry Semantics

- **Transient failures** (may resolve on retry — e.g., missing period that could be created later): raise domain exceptions so `autoretry_for` retries.
- **Permanent failures** (missing record, missing required field): return silently to avoid infinite retries.

## Double Idempotency Guard

Check outside the lock (fast path for retries), then again inside `select_for_update()` (prevents race conditions):

```python
if planned.transaction_id:
    return  # Fast path — no lock needed
with db_transaction.atomic():
    planned = PlannedTransaction.objects.select_for_update().get(id=planned_id)
    if planned.transaction_id:
        return  # Slow path — locked, prevents race
```

## Testing

See the `backend-testing` skill — `CELERY_TASK_ALWAYS_EAGER=True` makes `.delay()` synchronous; call tasks directly in tests and use the three-class structure (direct invocation / service dispatch / config validation).
