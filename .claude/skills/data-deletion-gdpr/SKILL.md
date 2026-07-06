---
name: data-deletion-gdpr
description: Model relationship map, deletion ordering (SET_NULL orphans, PROTECT chains), GDPR delete/export rules, import versioning, and legal document workflow for Denarly. Use when adding/removing Django models, changing FKs or on_delete behavior, touching UserService.delete_account/export_all_data/import_all_data, or editing privacy policy / terms of service.
---

# Data Deletion & GDPR Rules

## Model Relationships Reference

| Parent | Child | FK Field | on_delete | related_name |
|--------|-------|----------|-----------|-------------|
| Workspace | BudgetAccount | `workspace` | CASCADE | (default) |
| Workspace | Currency | `workspace` | CASCADE | `currencies` |
| BudgetAccount | BudgetPeriod | `budget_account` | CASCADE | `budget_periods` |
| BudgetPeriod | Transaction | `budget_period` | SET_NULL | `transactions` |
| BudgetPeriod | PlannedTransaction | `budget_period` | SET_NULL | `planned_transactions` |
| BudgetPeriod | CurrencyExchange | `budget_period` | SET_NULL | `currency_exchanges` |

## SET_NULL Children Must Be Explicitly Deleted

`Transaction`, `PlannedTransaction`, and `CurrencyExchange` have `on_delete=SET_NULL` on their `budget_period` FK. Django does **not** cascade-delete them — it sets `budget_period=NULL`, leaving orphaned rows. These orphans hold FK references to `Currency` (with `on_delete=PROTECT`), which blocks downstream deletions with unhandled 500 errors.

Any `delete()` method on a parent model with `SET_NULL` children must explicitly delete those children first:

```python
@staticmethod
@db_transaction.atomic
def delete(workspace_id: int, account_id: int) -> None:
    from currency_exchanges.models import CurrencyExchange
    from planned_transactions.models import PlannedTransaction
    from transactions.models import Transaction

    account = BudgetAccountService.get(account_id, workspace_id)
    period_ids = list(account.budget_periods.values_list('id', flat=True))
    Transaction.objects.filter(budget_period_id__in=period_ids).delete()
    PlannedTransaction.objects.filter(budget_period_id__in=period_ids).delete()
    CurrencyExchange.objects.filter(budget_period_id__in=period_ids).delete()
    account.delete()
```

> **When adding a new model with `on_delete=SET_NULL`**: Update every parent deletion service that could leave orphans. Also update `UserService.delete_account()` and `export_all_data()` per the GDPR rules below.

## Defense-in-Depth Deletion in `delete_account`

Even models with `on_delete=CASCADE` should be explicitly deleted in `UserService.delete_account()` before `user.delete()`. This keeps the flow robust if it's refactored to not delete the User row directly, and makes cleanup order auditable:

```python
UserTwoFactor.objects.filter(user=user).delete()  # CASCADE handles this, but explicit for defense-in-depth
user.delete()
```

> **When adding a new model owned by User**: Explicitly delete it in `delete_account()` regardless of `on_delete` behavior.

## GDPR Rules

**When adding or removing a Django model**, always check `backend/users/services.py`:

- `UserService.delete_account()` — ensure the new model's rows are deleted (or cascade correctly) before parent objects are removed. `on_delete=PROTECT` fields must be deleted in dependency order; otherwise account deletion raises an `OperationalError`.
- `UserService.export_all_data()` — include the new model's data in the JSON export (GDPR Art. 20). Export only non-sensitive fields (e.g., `is_enabled`, `created_at`, `last_used_at`). Never include secrets, encrypted values, or hashed tokens. Normalize nullable string fields with `or None` (e.g., `user.pending_email or None`) for cleaner JSON.

## Import Version Compatibility

`import_all_data` supports older export formats via `normalize_export_v1_to_v2()`, which transforms old key names and adds missing fields **before** processing. The import logic itself only handles the current (v2.0) format — all version-specific transformations live in the normalizer.

When adding new fields to the export format:
1. Update `export_all_data()` to include the new field
2. Update the normalizer to add sensible defaults for older exports missing that field
3. Bump `export_version` only for breaking changes (new required fields without defaults)

## Legal Documents

**When adding new data fields, processing purposes, or third-party integrations**, update the legal pages:
- `backend/core/templates/legal/privacy-policy.md` — reflect new data collected or how it is used
- `backend/core/templates/legal/terms-of-service.md` — reflect new features or usage rules

These files use Django template syntax with variables from environment settings:
- `{{ operator_name }}` — Company or individual name (LEGAL_OPERATOR_NAME)
- `{{ contact_email }}` — Contact email (LEGAL_CONTACT_EMAIL)
- `{{ jurisdiction }}` — Legal jurisdiction (LEGAL_JURISDICTION)
- `{% if is_individual %}...{% endif %}` — Conditional for individuals vs companies

After editing, bump the `version` in the YAML frontmatter to trigger re-consent prompts.

**Deploying legal document updates**: The database is the runtime source of truth. After bumping template versions, run:

```bash
python manage.py seed_legal_documents          # Seeds from templates if version changed
python manage.py seed_legal_documents --force  # Force update even if version matches
```

Alternatively, use Django admin to create/edit `LegalDocument` records directly.
