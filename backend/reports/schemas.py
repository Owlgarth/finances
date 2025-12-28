"""Pydantic schemas for reports API."""

from datetime import date
from decimal import Decimal
from pydantic import BaseModel, ConfigDict


class BudgetSummaryCategoryItem(BaseModel):
    """Schema for a single category in the budget summary."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    category_id: int
    category: str
    currency: str
    budget: Decimal
    actual: Decimal
    difference: Decimal


class CurrencySummary(BaseModel):
    """Schema for currency summary in budget report."""

    total_budget: Decimal
    total_actual: Decimal
    categories: list[BudgetSummaryCategoryItem]


class CurrencyBalances(BaseModel):
    """Schema for currency balances in summary."""

    opening: Decimal
    income: Decimal
    expenses: Decimal
    closing: Decimal


class BudgetSummaryOut(BaseModel):
    """Schema for budget summary period info."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    start_date: date
    end_date: date


class BudgetSummaryResponse(BaseModel):
    """Schema for complete budget summary response."""

    period: BudgetSummaryOut
    currencies: dict[str, CurrencySummary]
    balances: dict[str, CurrencyBalances]


class CurrentBalancesResponse(BaseModel):
    """Schema for current balances response."""

    PLN: Decimal = 0
    USD: Decimal = 0
    EUR: Decimal = 0
    UAH: Decimal = 0
