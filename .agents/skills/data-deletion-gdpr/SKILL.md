---
name: data-deletion-gdpr
description: Model relationship map, deletion ordering (SET_NULL orphans, PROTECT chains), GDPR delete/export rules, import versioning, and legal document workflow for Owlgarth Finances. Use when adding/removing Django models, changing FKs or on_delete behavior, touching UserService.delete_account/export_all_data/import_all_data, or editing privacy policy / terms of service.
---

# Data Deletion & GDPR Rules

## Model Relationships Reference (account-based model)

| Parent | Child | FK Field | on_delete | related_name |
|--------|-------|----------|-----------|-------------|
| Workspace | WorkspaceCurrency | `workspace` | CASCADE | `enabled_currencies` |
| Workspace | Account | `workspace` | CASCADE | `accounts` |
| Workspace | Budget | `workspace` | CASCADE | `budgets` |
| WorkspaceCurrency | Currency (catalog) | `currency` | PROTECT | — |
| Account | Transaction | `account` (nullable) | **PROTECT** | `transactions` |
| Account | Transfer (from/to) | `from_account`/`to_account` | **PROTECT** | `transfers_out`/`_in` |
| Account | PlannedTransaction | `account` (nullable) | **PROTECT** | `planned_transactions` |
| Currency (own, stored) | Transaction | `currency` | **PROTECT** | `transactions` |
| Currency (own, stored) | PlannedTransaction | `currency` | **PROTECT** | `planned_transactions` |
| Budget | Category | `budget` | CASCADE | `categories` |
| Budget | Period | `budget` | CASCADE | `periods` |
| Period | CategoryBudget | `period` | CASCADE | `category_budgets` |
| Transaction | TransactionItem | `transaction` | CASCADE | `items` |
| Transaction | TransactionAttachment | `transaction` | CASCADE | `attachments` |

Transactions and planned transactions may be account-less (nullable `account`) but always
carry their own mandatory `currency` FK - account-less rows PROTECT nothing on the account
side but still pin their currency row.

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

**Deletion safety under new FK shapes is verified by ORDER, not by code** - transactions
and planned transactions are deleted before accounts and before the custom-currency sweep,
so neither the nullable-account PROTECT nor the transaction/planned-currency PROTECT can
fire (account-less rows protect nothing on the account side but still pin their currency).
Pin ordering invariants like these with a test even when the production code did not change
in the task that noticed them - the pin is what makes the NEXT FK change provable.

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

**A nullable FK reference in an import row is a two-branch contract, not one.** `account = account_map.get(name) if name else None` imports the row account-less when the name is missing OR explicitly null (`.get()` returns `None` either way - the two shapes behave identically), while a NON-null unresolvable name still skips the row with an error - the file references an account the export lacks, a different failure class from a deliberate account-less row.

**Guard malformed-row inputs BEFORE calling resolvers that write.** `_resolve_import_currency(workspace, None)` would attempt `Currency.objects.create(code=None)` inside the import's atomic block - a 500 and a full rollback for one malformed row. The skip-with-error guard mirrors the adjacent unknown-account branch; only hand-edited files can reach it (well-formed exports always carry the code), but the guard keeps one bad row from destroying the whole import. Skip messages follow the report's uniform shape - `_('%(name)s: ...') % {'name': workspace_name}`, one interpolated value (the workspace name), entity type in the description - so every skip reason reads alike; new guards match it.

**Importers re-enter data invariants through the owning service's single-writer helper - never re-implement the math in the import path.** The v3 importer and the legacy restore loop both call `TransactionService._normalize_coverage(trans)` after their item creates instead of trusting the file's derived rows: a second implementation of a coverage rule drifts from the service's, and a hand-edited file's derived rows are exactly what the invariant exists to correct. Call it unconditionally where the owning service's create path does - the helper's own early-returns (adjustments) absorb the rows a call-site gate would duplicate.

**Import restores rows via `Model.objects.create` directly - never through the owning service's `create()` - while invariants re-enter through that service's pure helpers (the rule above).** A service create that fires side effects (recurring-rule create sync-generates its first occurrence) would re-trigger that work during import and duplicate rows the export already carries; row restoration is plain `objects.create` field-by-field with `.get()` defaults. The split is what is called: side-effect-free helpers yes, side-effecting service flows no. When the entity carries a generator watermark (a "generated up to" pointer like `RecurringTransaction.last_generated_date`), it must round-trip verbatim: a lost (NULL) pointer reads as "never generated", so the first materialization run after import re-generates occurrences the source system already produced - and their materialized rows imported as ordinary rows, so no constraint dedups them.

**A typed-arithmetic field needs `refresh_from_db()` after `objects.create` only when the import source supplies it as a string.** A JSON-round-tripped export carries `amount` as a string, and `Transaction.objects.create(amount='5.00')` keeps the raw `str` on the in-memory instance (Django coerces only on the DB round-trip) - later in-memory Decimal arithmetic on it crashes. Reload before calling the helper. The inverse is equally deliberate: a locally-built Decimal needs no reload - state the field's type provenance wherever the reload is skipped. A fresh post-create instance has no unsaved state, so the usual mid-update `refresh_from_db` caution does not apply.

**Child entities resolve through the SAME entity map the parent row used, scoped to the RESOLVED parent.** Item categories resolve via the transaction row's `category_map`, keyed by the resolved transaction category's budget - a transaction whose category failed resolution leaves its items NULL-inherit (the create-path rule), and a cross-budget name self-heals to NULL-inherit plus one skip error while the row still imports (the unknown-account mirror).

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
