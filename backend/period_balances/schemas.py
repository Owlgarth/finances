"""Pydantic schemas for period_balances API."""

from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, Field, field_serializer


class PeriodBalanceUpdate(BaseModel):
    """Schema for updating a period balance (opening balance)."""

    opening_balance: Decimal = Field(..., ge=0)


class PeriodBalanceOut(BaseModel):
    """Schema for period balance response."""

    id: int
    budget_period_id: int
    currency: str
    opening_balance: Decimal
    total_income: Decimal
    total_expenses: Decimal
    exchanges_in: Decimal
    exchanges_out: Decimal
    closing_balance: Decimal
    last_calculated_at: Optional[datetime] = None
    created_by: Optional[Any] = None
    updated_by: Optional[Any] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    @field_serializer('created_by', 'updated_by')
    def serialize_user(self, value: Any, _info) -> Optional[int]:
        """Serialize User to int (user id)."""
        return int(value.id) if value else None

    class Config:
        from_attributes = True


class RecalculateRequest(BaseModel):
    """Schema for recalculate request."""

    budget_period_id: int
    currency: str = Field(..., pattern='^[A-Z]{3}$')


class RecalculateAllRequest(BaseModel):
    """Schema for recalculate-all request."""

    budget_period_id: int
