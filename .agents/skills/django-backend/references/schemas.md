# Pydantic Schemas

Part of the `django-backend` skill. Read before adding or changing request/response schemas, optional collections, or partial-update semantics.

## Pydantic Schemas

```python
from pydantic import BaseModel, ConfigDict, Field

class TransactionCreate(BaseModel):
    """Schema for creating a transaction."""
    date: date
    description: str = Field(..., max_length=500)
    amount: Decimal = Field(..., gt=0)
    currency: str = Field(..., pattern=r'^[A-Z]{3}$')

class TransactionOut(BaseModel):
    """Schema for transaction response."""
    model_config = ConfigDict(from_attributes=True)
    id: int
    date: date
    amount: Decimal
```

**Optional list fields (and same-module forward references):** A schema referencing a type defined later in the same module must use the string form - `items: list['TransactionItemIn']` - because Python evaluates bare annotations at class-definition time (`NameError` fires before Pydantic ever sees the model; ruff flags `F821`); Pydantic v2 resolves string annotations at module-load finalization. The default is `Field(default_factory=list, max_length=N)` - never a bare `[]` (mutable default) - with `max_length` matching the sibling endpoint that already caps the same collection. `default_factory=list` keeps every existing caller that omits the field working. In the service, bulk-create the children inside the parent's existing `@db_transaction.atomic` block, guarded by `if data.items:` - the children become atomic with the parent for free. Helpers consuming an already-validated schema skip per-row defensive parsing; reserve try/except parsing for untyped sources (parser dicts, external APIs).

That default is for collections with a sane EMPTY default. When absence and emptiness must stay distinguishable - `[]` is invalid input (a 422 via `min_length=1`) while omission means "use your defaults" - the field is `Field(None, min_length=1, ...)` instead, and the service branches on truthiness (`if currency_codes:`), which additionally shields direct callers from an `IndexError` on an empty list.

**M2M collections serialize through a model property.** `from_attributes` cannot coerce a Django `RelatedManager` to `list[str]` - define `@property currency_codes -> list[str]` on the model (`[bc.currency.code for bc in self.currencies.all()]`). It serializes cleanly, consumes the prefetch cache when present, falls back to `Meta.ordering` otherwise, and becomes the ONE derivation path: the API `Out` schema, the GDPR exporter (`prefetch_related('currencies__currency')` feeding the same cache), and any future reader all read the property instead of re-deriving the comprehension. Exemplar: `Budget.currency_codes`.

**Cross-field validation:** Use `@field_validator` with `mode='after'`:

```python
@field_validator('to_currency', mode='after')
@classmethod
def currencies_must_differ(cls, v, info):
    if info.data.get('from_currency') == v:
        raise ValueError('Currencies must be different')
    return v
```

**Shared validated types:** When identical field validators repeat across schemas, extract a shared `Annotated` type with `BeforeValidator`:

```python
def _validate_email(v: str) -> str:
    v = v.lower().strip()
    validator = EmailValidator()
    try:
        validator(v)
    except DjangoValidationError:
        raise ValueError('Enter a valid email address')
    return v

ValidatedEmail = Annotated[str, BeforeValidator(_validate_email)]
```

Define the validation function as a module-level private function and the annotated type as a module constant. Only extract validators that are truly identical across all schemas - keep separate validators on schemas that may diverge. Email validators must include `.lower().strip()` so downstream code receives pre-normalized values.

**Dynamic dict-based schemas for multi-currency data:** When response data is keyed by a dynamic value (e.g., currency codes), use `dict[str, ValueType]` instead of hardcoded fields:

```python
class BudgetSummaryResponse(BaseModel):
    period: BudgetSummaryOut
    currencies: dict[str, CurrencySummary]   # Keyed by currency code ("PLN", "USD", …)
    balances: dict[str, CurrencyBalances]
```

Populate in the API layer by iterating the queryset and grouping into dicts.

**Removing a response field requires a consumer census.** Before dropping a field from an `Out` schema, grep every consumer of that field - frontend types, components, and tests - and migrate them in the same branch (the `download_url` removal paired the backend drop with the frontend blob rework). A field the backend silently stops sending while the frontend still types it is an invisible `undefined` at runtime, not a compile error.

## Distinguishing "Client Sent" from "Defaulted" on Partial Updates

When a Pydantic update schema defaults a boolean to `False` (not `None`) so the `setattr` loop sees a plain `bool`, the service cannot tell "client omitted the field" from "client sent `False`" by reading the validated attribute - both are `False`. Branch on the `model_dump(exclude_unset=True)` dict instead:

```python
update_data = data.model_dump(exclude_unset=True)
if update_data.get('is_default_for_currency') is True:
    # client explicitly sent True - run the pre-clear (see §Service Layer)
    Account.objects.for_workspace(workspace_id).filter(
        currency=account.currency, is_default_for_currency=True
    ).exclude(id=account.id).update(is_default_for_currency=False)
for field, value in update_data.items():
    setattr(account, field, value)
```

`exclude_unset=True` includes a key only if the client sent it, so `.get(...)` returns `None` when omitted and the actual value when sent. The `is True` identity check is what distinguishes an explicit `True` from both `None` (omitted) and `False` (explicitly cleared) - truthiness would mis-fire on a truthy non-bool.

**The full-replace dual: direct assignment makes the schema default the stored value.** An update service that assigns fields directly (`trans.note = data.note`, no `exclude_unset` loop) has full-replace semantics - an absent key stores the schema default, i.e. it CLEARS the field. That is free, correct absent-key behavior: pin it with the create schema's docstring and a replace-and-clear test instead of reaching for `exclude_unset`; the dict dance above exists only for partial-update schemas where omission must NOT overwrite.

**`exclude_unset=True` cascades into NESTED models - page-level full-replace dumps each present nested model whole.** A top-level `model_dump(exclude_unset=True)` on a schema with nested sub-models drops every field the client omitted inside a PRESENT nested model, silently losing the replace-with-null contract for those facets (Pydantic v2). For a full-replace PATCH over nested sub-models, iterate the TOP model's `model_fields_set` (which pages are present) and dump each present page WITHOUT `exclude_unset`, so omitted facets persist as explicit nulls; an explicit `null` page value stays a defensive no-op.
