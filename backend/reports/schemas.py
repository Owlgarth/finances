"""Pydantic schemas for reports API."""

from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class BudgetSummaryItem(BaseModel):
    """Planned vs actual for one category in one currency."""

    category_id: int
    category_name: str
    currency_code: str
    planned: Decimal
    actual: Decimal
    remaining: Decimal


class BudgetSummaryTotals(BaseModel):
    """Per-currency totals across the summary."""

    planned: Decimal
    actual: Decimal
    remaining: Decimal


class BudgetSummaryBudget(BaseModel):
    id: int
    name: str


class BudgetSummaryPeriod(BaseModel):
    id: int
    name: str
    start_date: date
    end_date: date


class BudgetSummaryResponse(BaseModel):
    """Schema for the budget summary response."""

    budget: BudgetSummaryBudget
    period: BudgetSummaryPeriod
    items: list[BudgetSummaryItem]
    totals: dict[str, BudgetSummaryTotals]


class AccountBalanceRow(BaseModel):
    """Computed balance of a single account."""

    account_id: int
    account_name: str
    currency_code: str
    is_archived: bool
    balance: Decimal


class CurrentBalancesResponse(BaseModel):
    """Schema for current balances response."""

    accounts: list[AccountBalanceRow]
    totals: dict[str, Decimal]
