"""Business logic for the reports app (rebuilt on the account/budgeting models)."""

from collections import defaultdict
from decimal import Decimal

from django.db.models import Sum

from accounts.services import AccountService
from budgeting.models import CategoryBudget
from budgeting.services import BudgetService, PeriodService
from transactions.models import Transaction


class ReportService:
    @staticmethod
    def get_budget_summary(workspace_id: int, budget_id: int, period_id: int) -> dict:
        """Planned vs actual per category for a budget's period.

        Planned amounts come from CategoryBudget rows; actuals are the sums of
        expense transactions per category by the transaction's own currency
        within the period's date range (account-less transactions count).
        Adjustments and income never count as actuals.
        """
        budget = BudgetService.get(budget_id, workspace_id)
        period = PeriodService._get_period(workspace_id, budget_id, period_id)

        planned_rows = period.category_budgets.select_related('category', 'currency')
        planned_map: dict[tuple[int, str], Decimal] = {
            (cb.category_id, cb.currency.code): cb.amount for cb in planned_rows
        }
        category_names = {cb.category_id: cb.category.name for cb in planned_rows}

        actual_rows = (
            Transaction.objects.for_workspace(workspace_id)
            .filter(
                category__budget_id=budget_id,
                type='expense',
                date__gte=period.start_date,
                date__lte=period.end_date,
            )
            .values('category_id', 'category__name', 'currency__code')
            .annotate(total=Sum('amount'))
        )
        actual_map: dict[tuple[int, str], Decimal] = {}
        for row in actual_rows:
            actual_map[(row['category_id'], row['currency__code'])] = row['total']
            category_names.setdefault(row['category_id'], row['category__name'])

        cents = Decimal('0.01')
        items = []
        for category_id, currency_code in sorted(
            planned_map.keys() | actual_map.keys(), key=lambda key: (category_names[key[0]].lower(), key[1])
        ):
            planned = planned_map.get((category_id, currency_code), Decimal('0')).quantize(cents)
            actual = actual_map.get((category_id, currency_code), Decimal('0')).quantize(cents)
            items.append(
                {
                    'category_id': category_id,
                    'category_name': category_names[category_id],
                    'currency_code': currency_code,
                    'planned': planned,
                    'actual': actual,
                    'remaining': (planned - actual).quantize(cents),
                }
            )

        totals: dict[str, dict[str, Decimal]] = defaultdict(
            lambda: {'planned': Decimal('0.00'), 'actual': Decimal('0.00'), 'remaining': Decimal('0.00')}
        )
        for item in items:
            bucket = totals[item['currency_code']]
            bucket['planned'] += item['planned']
            bucket['actual'] += item['actual']
            bucket['remaining'] += item['remaining']

        return {
            'budget': {'id': budget.id, 'name': budget.name},
            'period': {
                'id': period.id,
                'name': period.name,
                'start_date': period.start_date,
                'end_date': period.end_date,
            },
            'items': items,
            'totals': dict(totals),
        }

    @staticmethod
    def get_budget_history(workspace_id: int, budget_id: int, limit: int = 6) -> dict:
        """Planned vs actual totals per currency for the budget's most recent periods.

        Returns up to `limit` existing periods, oldest first — never materializes
        new ones. Same actual semantics as the summary: expense transactions of
        the budget's categories within each period's date range, grouped by the
        transaction's own currency (account-less transactions count).
        """
        budget = BudgetService.get(budget_id, workspace_id)
        recent = list(budget.periods.order_by('-start_date')[:limit])
        recent.reverse()

        planned_rows = (
            CategoryBudget.objects.filter(period__in=[p.id for p in recent])
            .values('period_id', 'currency__code')
            .annotate(total=Sum('amount'))
        )
        planned_map: dict[tuple[int, str], Decimal] = {
            (row['period_id'], row['currency__code']): row['total'] for row in planned_rows
        }

        cents = Decimal('0.01')
        periods = []
        for period in recent:
            actual_rows = (
                Transaction.objects.for_workspace(workspace_id)
                .filter(
                    category__budget_id=budget_id,
                    type='expense',
                    date__gte=period.start_date,
                    date__lte=period.end_date,
                )
                .values('currency__code')
                .annotate(total=Sum('amount'))
            )
            actual_map = {row['currency__code']: row['total'] for row in actual_rows}

            totals = {}
            for code in sorted({c for (pid, c) in planned_map if pid == period.id} | set(actual_map)):
                totals[code] = {
                    'planned': planned_map.get((period.id, code), Decimal('0')).quantize(cents),
                    'actual': actual_map.get(code, Decimal('0')).quantize(cents),
                }
            periods.append(
                {
                    'id': period.id,
                    'name': period.name,
                    'start_date': period.start_date,
                    'end_date': period.end_date,
                    'totals': totals,
                }
            )

        return {'budget': {'id': budget.id, 'name': budget.name}, 'periods': periods}

    @staticmethod
    def get_current_balances(workspace_id: int, include_archived: bool = False) -> dict:
        """Computed balance per account plus per-currency totals."""
        accounts = AccountService.list(workspace_id, include_archived=include_archived)

        account_rows = []
        totals: dict[str, Decimal] = defaultdict(lambda: Decimal('0'))
        for account in accounts:
            balance = AccountService.balance(account)
            account_rows.append(
                {
                    'account_id': account.id,
                    'account_name': account.name,
                    'currency_code': account.currency.code,
                    'is_archived': account.is_archived,
                    'balance': balance,
                }
            )
            totals[account.currency.code] += balance

        return {'accounts': account_rows, 'totals': dict(totals)}
