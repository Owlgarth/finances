"""Starter and sample data for new workspaces (account-based model).

``create_starter_fixtures`` runs for every new workspace: it leaves the
workspace empty but usable — a General budget with starter categories and the
current period materialized. ``create_demo_fixtures`` is opt-in and layers
realistic sample records (extra account, transactions, transfer, planned) on
top of the starter data.
"""

from datetime import date, timedelta
from decimal import Decimal

from accounts.models import Account, AccountType
from budgeting.models import Budget, Cadence
from budgeting.services import PeriodService
from categories.models import Category
from currencies.services import CurrencyCatalogService
from planned_transactions.models import PlannedTransaction
from transactions.models import Transaction
from transfers.models import Transfer

STARTER_CATEGORIES = [
    'Food & Groceries',
    'Transportation',
    'Entertainment',
    'Bills & Utilities',
    'Shopping',
    'Health & Fitness',
    'Salary',
]


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
    """
    Create opt-in sample data for a new workspace (on top of starter fixtures).

    Adds a savings account, sample transactions and a transfer for the previous
    month, and sample planned transactions.
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

    start_date, _end_date = get_previous_month_date_range()
    mid_month = start_date + timedelta(days=15)
    early_month = start_date + timedelta(days=5)

    transactions_data = [
        # Income
        (start_date, 'Monthly Salary', 'Salary', Decimal('5000.00'), 'income'),
        (mid_month, 'Freelance Project', 'Salary', Decimal('1500.00'), 'income'),
        # Expenses
        (early_month, 'Weekly Groceries', 'Food & Groceries', Decimal('350.00'), 'expense'),
        (mid_month, 'Restaurant Dinner', 'Food & Groceries', Decimal('180.00'), 'expense'),
        (start_date + timedelta(days=3), 'Public Transport Card', 'Transportation', Decimal('120.00'), 'expense'),
        (mid_month + timedelta(days=2), 'Gas Station', 'Transportation', Decimal('250.00'), 'expense'),
        (start_date + timedelta(days=10), 'Movie Tickets', 'Entertainment', Decimal('80.00'), 'expense'),
        (mid_month + timedelta(days=5), 'Streaming Subscription', 'Entertainment', Decimal('49.90'), 'expense'),
        (start_date + timedelta(days=1), 'Electricity Bill', 'Bills & Utilities', Decimal('320.00'), 'expense'),
        (start_date + timedelta(days=2), 'Internet Bill', 'Bills & Utilities', Decimal('89.90'), 'expense'),
        (start_date + timedelta(days=7), 'Clothing Store', 'Shopping', Decimal('299.00'), 'expense'),
        (mid_month + timedelta(days=3), 'Electronics', 'Shopping', Decimal('450.00'), 'expense'),
        (start_date + timedelta(days=12), 'Gym Membership', 'Health & Fitness', Decimal('150.00'), 'expense'),
        (mid_month + timedelta(days=7), 'Pharmacy', 'Health & Fitness', Decimal('85.00'), 'expense'),
    ]

    for trans_date, description, cat_name, amount, trans_type in transactions_data:
        Transaction.objects.create(
            workspace_id=workspace_id,
            account=main_account,
            date=trans_date,
            description=description,
            category=category_map[cat_name],
            amount=amount,
            type=trans_type,
            created_by_id=user_id,
        )

    # Materialize the previous-month period for the General budget so the
    # budget view has something to show right away.
    PeriodService.get_or_create_for_date(None, general_budget, start_date)

    # A same-currency transfer into savings (replaces the old exchange demo)
    Transfer.objects.create(
        workspace_id=workspace_id,
        from_account=main_account,
        to_account=savings_account,
        from_amount=Decimal('500.00'),
        to_amount=Decimal('500.00'),
        date=mid_month,
        description='Monthly savings',
        created_by_id=user_id,
    )

    planned_data = [
        ('Rent Payment', Decimal('2000.00'), 'Bills & Utilities', start_date + timedelta(days=25), None, 'pending'),
        (
            'Phone Bill',
            Decimal('79.90'),
            'Bills & Utilities',
            start_date + timedelta(days=20),
            start_date + timedelta(days=20),
            'done',
        ),
        ('Car Insurance', Decimal('450.00'), 'Transportation', start_date + timedelta(days=28), None, 'pending'),
    ]

    for name, amount, cat_name, planned_date, payment_date, status in planned_data:
        PlannedTransaction.objects.create(
            workspace_id=workspace_id,
            account=main_account,
            name=name,
            amount=amount,
            category=category_map[cat_name],
            planned_date=planned_date,
            payment_date=payment_date,
            status=status,
            created_by_id=user_id,
        )
