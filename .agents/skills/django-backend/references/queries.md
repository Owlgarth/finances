# Aggregations and Window Queries

Part of the `django-backend` skill. Read before writing aggregates, GROUP BY queries, or newest-per-group enrichment.

## Aggregation Seams and GROUP BY Discipline

**Cross-app aggregates delegate to a seam in the OWNING app.** When another app reads an aggregate over your rows (budget actuals over transaction items), the owning app exposes the shared math as module-level expression constants (`EFFECTIVE_CATEGORY_ID`, `EFFECTIVE_TOTAL`) plus one public helper or row-generator; consumers fold rows into their own response shapes and never re-derive the expression math. Reports imports from transactions, never the reverse - two inline derivations of the same Coalesce logic drift apart silently.

**`values().annotate(Sum(...))` over a model with `Meta.ordering` splits every row into its own group** unless the ordering is cleared first: Django appends the ordering columns to the GROUP BY, so `TransactionItem.Meta.ordering = ['position', 'id']` turns a per-category sum into one group per item. End the chain with an explicit `.order_by()` (the grouped columns, or empty) plus a WHY comment at the call site. The trap is invisible in assertions - a correct Python-side dict-fold over the split rows still sums to the right total while quietly pulling one row per item - so only the query shape proves the fix.

## Newest-Per-Group Enrichment (Window Functions)

Enriching grouped rows with their newest member (last-used values per frequent description) is ONE window-function query joined to the grouped rows via a dict in Python - never per-group `.first()` chains, which cost N+1 queries scaling with group count and `limit`:

```python
rows = queryset.annotate(
    lower_desc=Lower('description'),
    currency_code=F('currency__code'),
    rn=Window(
        expression=RowNumber(),
        partition_by=[Lower('description'), F('currency__code')],
        order_by=[F('date').desc(), F('id').desc()],
    ),
).values('lower_desc', 'currency_code', 'amount', 'category_id',
         'category__is_archived', 'account__is_archived', 'rn')
last_by_group = {(r['lower_desc'], r['currency_code']): r for r in rows if r['rn'] == 1}
```

- **Django disallows filtering on window annotations** (`FieldError: Window is disallowed in the filter clause`), so `rn == 1` rows are kept during PYTHON evaluation - the query count stays constant in the number of groups and in `limit`, which is the property the endpoint owns (when the sibling queries already scan every workspace row, the window scan adds no new cost class). The query-count invariance is pinned by the two-run `CaptureQueriesContext` test shape in the `backend-testing` skill.
- **`.annotate(window)` + `.values(...)` with no aggregate functions is a plain SELECT (no GROUP BY)**; related traversals (`category__is_archived`, `account__is_archived`) LEFT JOIN and read as `None` when the FK is `None`, so archived-nulling logic branches on them directly.
- The ordering (`F('date').desc(), F('id').desc()`) is the same unique-field tiebreak rule as sortable lists - max date, then max id.
- Exemplar: `TransactionService._last_transactions_by_group` feeding `frequent_descriptions`.
