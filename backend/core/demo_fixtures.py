"""Demo fixtures service for creating sample data in new workspaces.

This module provides functionality to populate new workspaces with example data
to help users understand how Monie works.
"""

from datetime import date, datetime, timedelta
from decimal import Decimal

from budget_accounts.models import BudgetAccount
from budget_periods.models import BudgetPeriod
from budgets.models import Budget
from categories.models import Category
from currency_exchanges.models import CurrencyExchange
from period_balances.models import PeriodBalance
from planned_transactions.models import PlannedTransaction
from transactions.models import Transaction


def get_previous_month_name() -> str:
    """Get the name of the previous month in format 'Month YYYY' (e.g., 'October 2025')."""
    today = date.today()
    first_of_current_month = date(today.year, today.month, 1)
    last_month_date = first_of_current_month - timedelta(days=1)

    return last_month_date.strftime('%B %Y')


def get_previous_month_date_range() -> tuple[date, date]:
    """Get the start and end dates of the previous month."""
    today = date.today()
    first_of_current_month = date(today.year, today.month, 1)
    end_date = first_of_current_month - timedelta(days=1)
    start_date = date(end_date.year, end_date.month, 1)

    return start_date, end_date


def create_demo_fixtures(
    workspace_id: int | str,
    user_id: int | str,
    budget_account: BudgetAccount | None = None,
) -> None:
    """
    Create demo fixtures for a new workspace.

    This creates:
    - A budget period for the previous month
    - Sample categories
    - Sample budgets
    - Sample transactions (various types)
    - Sample planned transactions
    - Sample currency exchanges
    - Period balances
    """
    # Get or create budget account
    if budget_account is None:
        budget_account = BudgetAccount.objects.create(
            workspace_id=workspace_id,
            name='Example Account',
            description='Example budget account with demo data',
            default_currency='PLN',
            color='#10B981',
            icon='📊',
            is_active=True,
            display_order=0,
            created_by_id=user_id,
        )

    # Create budget period for previous month
    period_name = get_previous_month_name()
    start_date, end_date = get_previous_month_date_range()

    # Calculate the number of weeks in the period
    days = (end_date - start_date).days + 1
    weeks = max(1, round(days / 7))

    budget_period = BudgetPeriod.objects.create(
        budget_account=budget_account,
        name=period_name,
        start_date=start_date,
        end_date=end_date,
        weeks=weeks,
        created_by_id=user_id,
    )

    # Create categories
    categories_data = [
        'Food & Groceries',
        'Transportation',
        'Entertainment',
        'Bills & Utilities',
        'Shopping',
        'Health & Fitness',
        'Salary',
    ]

    categories = []
    for cat_name in categories_data:
        category = Category.objects.create(
            budget_period=budget_period,
            name=cat_name,
            created_by_id=user_id,
        )
        categories.append(category)

    # Map category names to objects for easy access
    category_map = {cat.name: cat for cat in categories}

    # Create budgets for expense categories
    budgets_data = [
        ('Food & Groceries', 'PLN', Decimal('1500.00')),
        ('Transportation', 'PLN', Decimal('500.00')),
        ('Entertainment', 'PLN', Decimal('400.00')),
        ('Bills & Utilities', 'PLN', Decimal('800.00')),
        ('Shopping', 'PLN', Decimal('600.00')),
        ('Health & Fitness', 'PLN', Decimal('300.00')),
    ]

    for cat_name, currency, amount in budgets_data:
        Budget.objects.create(
            budget_period=budget_period,
            category=category_map[cat_name],
            currency=currency,
            amount=amount,
            created_by_id=user_id,
        )

    # Create sample transactions
    mid_month = start_date + timedelta(days=15)
    early_month = start_date + timedelta(days=5)

    transactions_data = [
        # Income
        (start_date, 'Monthly Salary', 'Salary', Decimal('5000.00'), 'PLN', 'income'),
        (mid_month, 'Freelance Project', 'Salary', Decimal('1500.00'), 'PLN', 'income'),
        # Expenses
        (early_month, 'Weekly Groceries', 'Food & Groceries', Decimal('350.00'), 'PLN', 'expense'),
        (mid_month, 'Restaurant Dinner', 'Food & Groceries', Decimal('180.00'), 'PLN', 'expense'),
        (
            start_date + timedelta(days=3),
            'Public Transport Card',
            'Transportation',
            Decimal('120.00'),
            'PLN',
            'expense',
        ),
        (mid_month + timedelta(days=2), 'Gas Station', 'Transportation', Decimal('250.00'), 'PLN', 'expense'),
        (start_date + timedelta(days=10), 'Movie Tickets', 'Entertainment', Decimal('80.00'), 'PLN', 'expense'),
        (mid_month + timedelta(days=5), 'Streaming Subscription', 'Entertainment', Decimal('49.90'), 'PLN', 'expense'),
        (start_date + timedelta(days=1), 'Electricity Bill', 'Bills & Utilities', Decimal('320.00'), 'PLN', 'expense'),
        (start_date + timedelta(days=2), 'Internet Bill', 'Bills & Utilities', Decimal('89.90'), 'PLN', 'expense'),
        (start_date + timedelta(days=7), 'Clothing Store', 'Shopping', Decimal('299.00'), 'PLN', 'expense'),
        (mid_month + timedelta(days=3), 'Electronics', 'Shopping', Decimal('450.00'), 'PLN', 'expense'),
        (start_date + timedelta(days=12), 'Gym Membership', 'Health & Fitness', Decimal('150.00'), 'PLN', 'expense'),
        (mid_month + timedelta(days=7), 'Pharmacy', 'Health & Fitness', Decimal('85.00'), 'PLN', 'expense'),
    ]

    for trans_date, description, cat_name, amount, currency, trans_type in transactions_data:
        Transaction.objects.create(
            budget_period=budget_period,
            date=trans_date,
            description=description,
            category=category_map[cat_name],
            amount=amount,
            currency=currency,
            type=trans_type,
            created_by_id=user_id,
        )

    # Create planned transactions
    planned_data = [
        (
            'Rent Payment',
            Decimal('2000.00'),
            'PLN',
            'Bills & Utilities',
            start_date + timedelta(days=25),
            None,
            'pending',
        ),
        (
            'Phone Bill',
            Decimal('79.90'),
            'PLN',
            'Bills & Utilities',
            start_date + timedelta(days=20),
            start_date + timedelta(days=20),
            'done',
        ),
        ('Car Insurance', Decimal('450.00'), 'PLN', 'Transportation', start_date + timedelta(days=28), None, 'pending'),
    ]

    for name, amount, currency, cat_name, planned_date, payment_date, status in planned_data:
        PlannedTransaction.objects.create(
            budget_period=budget_period,
            name=name,
            amount=amount,
            currency=currency,
            category=category_map[cat_name],
            planned_date=planned_date,
            payment_date=payment_date,
            status=status,
            created_by_id=user_id,
        )

    # Create currency exchanges
    exchanges_data = [
        (
            start_date + timedelta(days=8),
            'Exchange EUR to PLN',
            'EUR',
            Decimal('200.00'),
            'PLN',
            Decimal('860.00'),
            Decimal('4.3000'),
        ),
        (
            mid_month + timedelta(days=4),
            'Exchange USD to PLN',
            'USD',
            Decimal('100.00'),
            'PLN',
            Decimal('395.00'),
            Decimal('3.9500'),
        ),
    ]

    for ex_date, description, from_curr, from_amt, to_curr, to_amt, rate in exchanges_data:
        CurrencyExchange.objects.create(
            budget_period=budget_period,
            date=ex_date,
            description=description,
            from_currency=from_curr,
            from_amount=from_amt,
            to_currency=to_curr,
            to_amount=to_amt,
            exchange_rate=rate,
            created_by_id=user_id,
        )

    # Create period balances
    pln_income = Decimal('6500.00')  # 5000 + 1500
    pln_expenses = Decimal('2423.80')  # Sum of all PLN expenses
    pln_exchanges_in = Decimal('1255.00')  # 860 + 395
    pln_exchanges_out = Decimal('0.00')
    pln_opening = Decimal('1000.00')
    pln_closing = pln_opening + pln_income - pln_expenses + pln_exchanges_in - pln_exchanges_out

    balances_data = [
        ('PLN', pln_opening, pln_income, pln_expenses, pln_exchanges_in, pln_exchanges_out, pln_closing),
        (
            'EUR',
            Decimal('500.00'),
            Decimal('0.00'),
            Decimal('0.00'),
            Decimal('0.00'),
            Decimal('200.00'),
            Decimal('300.00'),
        ),
        (
            'USD',
            Decimal('250.00'),
            Decimal('0.00'),
            Decimal('0.00'),
            Decimal('0.00'),
            Decimal('100.00'),
            Decimal('150.00'),
        ),
    ]

    now = datetime.now()

    for currency, opening, income, expenses, ex_in, ex_out, closing in balances_data:
        PeriodBalance.objects.create(
            budget_period=budget_period,
            currency=currency,
            opening_balance=opening,
            total_income=income,
            total_expenses=expenses,
            exchanges_in=ex_in,
            exchanges_out=ex_out,
            closing_balance=closing,
            last_calculated_at=now,
            created_by_id=user_id,
        )
