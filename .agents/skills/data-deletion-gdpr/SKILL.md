---
name: data-deletion-gdpr
description: Model relationship map, deletion ordering (SET_NULL orphans, PROTECT chains), GDPR delete/export rules, import versioning, and legal document workflow for Denarly. Use when adding/removing Django models, changing FKs or on_delete behavior, touching UserService.delete_account/export_all_data/import_all_data, or editing privacy policy / terms of service.
---

# Data Deletion & GDPR Rules

## Model Relationships Reference (account-based model)

| Parent | Child | FK Field | on_delete | related_name |
|--------|-------|----------|-----------|-------------|
| Workspace | WorkspaceCurrency | `workspace` | CASCADE | `enabled_currencies` |
| Workspace | Account | `workspace` | CASCADE | `accounts` |
| Workspace | Budget | `workspace` | CASCADE | `budgets` |
| WorkspaceCurrency | Currency (catalog) | `currency` | PROTECT | — |
| Account | Transaction | `account` | **PROTECT** | `transactions` |
| Account | Transfer (from/to) | `from_account`/`to_account` | **PROTECT** | `transfers_out`/`_in` |
| Account | PlannedTransaction | `account` | **PROTECT** | `planned_transactions` |
| Budget | Category | `budget` | CASCADE | `categories` |
| Budget | Period | `budget` | CASCADE | `periods` |
| Period | CategoryBudget | `period` | CASCADE | `category_budgets` |
| Transaction | TransactionItem | `transaction` | CASCADE | `items` |
| Transaction | TransactionAttachment | `transaction` | CASCADE | `attachments` |

## PROTECT Chains Must Be Deleted in Dependency Order

Accounts are **PROTECT**-referenced by transactions, transfers, and planned
transactions; catalog currencies are PROTECT-referenced by accounts, category
budgets, and workspace enablements. Deleting out of order raises an
`IntegrityError`. The single source of truth is
`common/services/base.py::delete_workspace_financial_records`, which deletes:

```
transfers → transactions → planned_transactions → category_budgets
  → categories → budgets (cascades periods) → accounts
  → workspace-currency enablements → workspace-custom currency rows
```

Global catalog currencies are shared and never deleted; only workspace-custom
`Currency` rows are removed, and only after everything referencing them is gone.

> **When adding a new model that PROTECT-references accounts or currencies**:
> add it to `delete_workspace_financial_records` in the correct order, and to
> `UserService.delete_account()` / `export_all_data()` per the GDPR rules below.

## Storage Objects Are Not Cascaded

`TransactionAttachment` rows cascade with their transaction, but the **files in
S3 do not**. `AttachmentService.delete_storage_for_transactions(qs)` must be
called *before* deleting the transactions (it is, in both the per-transaction
delete and `delete_workspace_financial_records`). Any new model that owns stored
objects needs the same explicit pre-delete sweep.

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

**CASCADE is not a data-classification statement.** `on_delete=CASCADE` to user/workspace is a storage-cleanup concern — a model can cascade with its owner yet be deliberately excluded from `export_all_data()`/`import_all_data()` as a transient operational record (e.g. the idempotency-key dedup map). For such models, verify no export/import path picked them up: `grep -rn <Model> backend/users/ backend/common/services/` must return nothing.

## Import Version Compatibility

The main `import_all_data` handles the current **v3.0** export only (same-system
restore). Legacy v1/v2 exports from before the account-based redesign go through a
separate endpoint, `POST /users/import-legacy` (`LegacyImportService`), which
converts the old shape — symbol→ISO currencies, `Main <CODE>` accounts,
exchanges→transfers, linked-transaction dedup, opening-balance solving — and returns
a per-workspace verification report.

When adding new fields to the v3 export format:
1. Update `export_all_data()` (the `_export_workspace_v3` helper) to include the field.
2. Update `import_all_data()` to read it with a sensible default for older v3 files — always via `data.get('field', default)`, never `data['field']`, since older exports predate the key and would `KeyError`:

   ```python
   Account.objects.create(
       ...,
       is_default_for_currency=acc_data.get('is_default_for_currency', False),
   )
   ```

3. Attachments travel as base64 in the export; items travel inline on each
   transaction. Keep both round-tripping when you touch the transaction export.
4. Bump `export_version` only for **breaking** changes (renames, type changes, semantic shifts). An additive field with a safe default (e.g. a new boolean defaulting to `False`) does **not** bump the version — an older reader ignores the new key; a newer reader handles its absence.

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
