"""Starter and sample data for new workspaces (account-based model).

``create_starter_fixtures`` runs for every new workspace: it leaves the
workspace empty but usable - a General budget with starter categories and the
current period materialized. ``create_demo_fixtures`` is opt-in and layers
realistic sample records on top of the starter data: a second account, two
months of transactions (previous month complete, current month up to today),
a recurring savings transfer, upcoming planned transactions, and per-category
budget estimates for both periods.
"""

from datetime import date, timedelta
from decimal import Decimal

from accounts.models import Account, AccountType
from budgeting.models import Budget, Cadence, CategoryBudget
from budgeting.services import PeriodService
from categories.models import Category
from currencies.services import CurrencyCatalogService
from planned_transactions.models import PlannedTransaction
from transactions.models import Transaction
from transfers.models import Transfer

STARTER_CATEGORIES = [
    'Food & Groceries',
    'Dining Out',
    'Transportation',
    'Entertainment',
    'Bills & Utilities',
    'Shopping',
    'Health & Fitness',
]

# Demo estimate amount per starter category, seeded into both demo periods.
CATEGORY_ESTIMATES = {
    'Food & Groceries': Decimal('1200.00'),
    'Dining Out': Decimal('400.00'),
    'Transportation': Decimal('500.00'),
    'Entertainment': Decimal('250.00'),
    'Bills & Utilities': Decimal('1500.00'),
    'Shopping': Decimal('600.00'),
    'Health & Fitness': Decimal('300.00'),
}


def get_previous_month_date_range() -> tuple[date, date]:
    """Get the start and end dates of the previous month."""
    today = date.today()
    first_of_current_month = date(today.year, today.month, 1)
    end_date = first_of_current_month - timedelta(days=1)
    start_date = date(end_date.year, end_date.month, 1)

    return start_date, end_date


def _get_or_create_main_account(workspace_id, user_id) -> Account:
    account = Account.objects.filter(workspace_id=workspace_id, name='Main').first()
    if not account:
        pln_catalog = CurrencyCatalogService.enable(None, workspace_id, 'PLN')
        account = Account.objects.create(
            workspace_id=workspace_id,
            name='Main',
            type=AccountType.BANK,
            currency=pln_catalog,
            created_by_id=user_id,
        )
    return account


def _get_or_create_general_budget(workspace_id, user_id) -> Budget:
    budget = Budget.objects.filter(workspace_id=workspace_id, name='General').first()
    if not budget:
        budget = Budget.objects.create(
            workspace_id=workspace_id,
            name='General',
            cadence=Cadence.MONTHLY,
            created_by_id=user_id,
        )
    return budget


def _clamp_to(day: int, month_start: date, today: date) -> date:
    """Resolve 1-based ``day`` within the month of ``month_start``, never later than ``today``."""
    return min(month_start + timedelta(days=day - 1), today)


def _create_demo_transactions(
    workspace_id,
    user_id,
    main_account: Account,
    category_map: dict[str, Category],
    prev_month_start: date,
    current_month_start: date,
    today: date,
) -> None:
    """Create the sample transactions for both seeded months.

    The previous month is fully populated; current-month rows clamp to today
    (same-day stacking early in the month is accepted). Income rows carry no
    category. One-off purchases stay previous-month-only to imply the current
    month is still in progress.
    """
    # (day of month, description, category name or None, amount, type)
    previous_month_rows = [
        (1, 'Monthly Salary', None, Decimal('5000.00'), 'income'),
        (15, 'Freelance Project', None, Decimal('1500.00'), 'income'),
        (5, 'Weekly Groceries', 'Food & Groceries', Decimal('350.00'), 'expense'),
        (20, 'Grocery Store', 'Food & Groceries', Decimal('280.00'), 'expense'),
        (16, 'Restaurant Dinner', 'Dining Out', Decimal('180.00'), 'expense'),
        (8, 'Coffee Shop', 'Dining Out', Decimal('45.50'), 'expense'),
        (3, 'Public Transport Card', 'Transportation', Decimal('120.00'), 'expense'),
        (18, 'Gas Station', 'Transportation', Decimal('250.00'), 'expense'),
        (10, 'Movie Tickets', 'Entertainment', Decimal('80.00'), 'expense'),
        (20, 'Streaming Subscription', 'Entertainment', Decimal('49.90'), 'expense'),
        (1, 'Electricity Bill', 'Bills & Utilities', Decimal('320.00'), 'expense'),
        (2, 'Internet Bill', 'Bills & Utilities', Decimal('89.90'), 'expense'),
        (7, 'Clothing Store', 'Shopping', Decimal('299.00'), 'expense'),
        (19, 'Electronics', 'Shopping', Decimal('450.00'), 'expense'),
        (12, 'Gym Membership', 'Health & Fitness', Decimal('150.00'), 'expense'),
        (22, 'Pharmacy', 'Health & Fitness', Decimal('85.00'), 'expense'),
    ]
    current_month_rows = [
        (1, 'Monthly Salary', None, Decimal('5000.00'), 'income'),
        (15, 'Freelance Project', None, Decimal('1500.00'), 'income'),
        (1, 'Electricity Bill', 'Bills & Utilities', Decimal('320.00'), 'expense'),
        (2, 'Internet Bill', 'Bills & Utilities', Decimal('89.90'), 'expense'),
        (5, 'Weekly Groceries', 'Food & Groceries', Decimal('350.00'), 'expense'),
        (7, 'Clothing Store', 'Shopping', Decimal('299.00'), 'expense'),
        (8, 'Coffee Shop', 'Dining Out', Decimal('45.50'), 'expense'),
        (3, 'Public Transport Card', 'Transportation', Decimal('120.00'), 'expense'),
        (12, 'Gym Membership', 'Health & Fitness', Decimal('150.00'), 'expense'),
        (20, 'Streaming Subscription', 'Entertainment', Decimal('49.90'), 'expense'),
    ]

    rows = [
        (prev_month_start + timedelta(days=day - 1), description, cat_name, amount, trans_type)
        for day, description, cat_name, amount, trans_type in previous_month_rows
    ]
    rows += [
        (_clamp_to(day, current_month_start, today), description, cat_name, amount, trans_type)
        for day, description, cat_name, amount, trans_type in current_month_rows
    ]

    for trans_date, description, cat_name, amount, trans_type in rows:
        Transaction.objects.create(
            workspace_id=workspace_id,
            account=main_account,
            currency=main_account.currency,
            date=trans_date,
            description=description,
            category=category_map[cat_name] if cat_name else None,
            amount=amount,
            type=trans_type,
            created_by_id=user_id,
        )


def _create_demo_transfers(
    workspace_id,
    user_id,
    main_account: Account,
    savings_account: Account,
    prev_month_start: date,
    current_month_start: date,
    today: date,
) -> None:
    """Create the recurring savings transfer in both seeded months."""
    for transfer_date in (
        prev_month_start + timedelta(days=15),
        _clamp_to(16, current_month_start, today),
    ):
        Transfer.objects.create(
            workspace_id=workspace_id,
            from_account=main_account,
            to_account=savings_account,
            from_amount=Decimal('500.00'),
            to_amount=Decimal('500.00'),
            date=transfer_date,
            description='Monthly savings',
            created_by_id=user_id,
        )


def _create_demo_planned(
    workspace_id,
    user_id,
    main_account: Account,
    category_map: dict[str, Category],
    prev_month_start: date,
    current_month_start: date,
) -> None:
    """Create one already-executed planned transaction and upcoming pending ones."""
    if current_month_start.month == 12:
        next_month_start = date(current_month_start.year + 1, 1, 1)
    else:
        next_month_start = date(current_month_start.year, current_month_start.month + 1, 1)
    current_month_end = next_month_start - timedelta(days=1)

    # (name, amount, category name, planned_date, payment_date, status)
    planned_rows = [
        # Already paid in the previous month.
        (
            'Phone Bill',
            Decimal('79.90'),
            'Bills & Utilities',
            prev_month_start + timedelta(days=19),
            prev_month_start + timedelta(days=19),
            'done',
        ),
        # Upcoming.
        ('Rent Payment', Decimal('2000.00'), 'Bills & Utilities', current_month_end, None, 'pending'),
        ('Internet Bill', Decimal('89.90'), 'Bills & Utilities', next_month_start + timedelta(days=1), None, 'pending'),
        ('Car Insurance', Decimal('450.00'), 'Transportation', next_month_start + timedelta(days=24), None, 'pending'),
    ]

    for name, amount, cat_name, planned_date, payment_date, status in planned_rows:
        PlannedTransaction.objects.create(
            workspace_id=workspace_id,
            account=main_account,
            currency=main_account.currency,
            name=name,
            amount=amount,
            category=category_map[cat_name],
            planned_date=planned_date,
            payment_date=payment_date,
            status=status,
            created_by_id=user_id,
        )


def _seed_category_budgets(
    workspace_id,
    user_id,
    main_account: Account,
    category_map: dict[str, Category],
    periods,
) -> None:
    """Seed one estimate row per starter category for each given period."""
    for period in periods:
        for cat_name, amount in CATEGORY_ESTIMATES.items():
            CategoryBudget.objects.create(
                period=period,
                workspace_id=workspace_id,
                category=category_map[cat_name],
                currency=main_account.currency,
                amount=amount,
                created_by_id=user_id,
                updated_by_id=user_id,
            )


def create_starter_fixtures(workspace_id: int | str, user_id: int | str) -> None:
    """Make a fresh workspace immediately usable (no sample records).

    Ensures the Main account and General budget exist, seeds starter
    categories, and materializes the current period so the budget view has
    something to show on first login.
    """
    _get_or_create_main_account(workspace_id, user_id)
    general_budget = _get_or_create_general_budget(workspace_id, user_id)

    for cat_name in STARTER_CATEGORIES:
        if not Category.objects.filter(budget=general_budget, name__iexact=cat_name).exists():
            Category.objects.create(
                budget=general_budget,
                workspace_id=workspace_id,
                name=cat_name,
                created_by_id=user_id,
            )

    PeriodService.get_or_create_for_date(None, general_budget, date.today())


def create_demo_fixtures(workspace_id: int | str, user_id: int | str) -> None:
    """Create opt-in sample data for a new workspace (on top of starter fixtures).

    Adds a savings account, two months of sample transactions (previous month
    complete, current month clamped to today), a recurring savings transfer,
    one executed plus several upcoming planned transactions, and per-category
    budget estimates for both periods.
    """
    create_starter_fixtures(workspace_id, user_id)

    main_account = _get_or_create_main_account(workspace_id, user_id)

    savings_account = Account.objects.filter(workspace_id=workspace_id, name='Savings').first()
    if not savings_account:
        savings_account = Account.objects.create(
            workspace_id=workspace_id,
            name='Savings',
            type=AccountType.BANK,
            currency=main_account.currency,
            opening_balance=Decimal('1000.00'),
            created_by_id=user_id,
        )

    general_budget = _get_or_create_general_budget(workspace_id, user_id)

    # Starter fixtures already created these; reuse them.
    category_map = {cat.name: cat for cat in Category.objects.filter(budget=general_budget)}

    today = date.today()
    prev_month_start, _end_date = get_previous_month_date_range()
    current_month_start = date(today.year, today.month, 1)

    # Starter fixtures already materialized the current period before any
    # estimates existed, so its copy_forward had nothing to duplicate; the
    # second call below just re-fetches it. Do not reorder: a period created
    # after an earlier one gained estimates gets them copied forward, and the
    # explicit seed below would then violate (period, category, currency)
    # uniqueness.
    previous_period = PeriodService.get_or_create_for_date(None, general_budget, prev_month_start)
    current_period = PeriodService.get_or_create_for_date(None, general_budget, today)

    _create_demo_transactions(
        workspace_id, user_id, main_account, category_map, prev_month_start, current_month_start, today
    )
    _create_demo_transfers(
        workspace_id, user_id, main_account, savings_account, prev_month_start, current_month_start, today
    )
    _create_demo_planned(workspace_id, user_id, main_account, category_map, prev_month_start, current_month_start)
    _seed_category_budgets(workspace_id, user_id, main_account, category_map, (previous_period, current_period))
