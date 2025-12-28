"""Pydantic schemas for budgets API."""

from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, field_serializer


class BudgetCreate(BaseModel):
    """Schema for creating a budget."""

    budget_period_id: int
    category_id: int
    currency: str = Field(..., pattern='^[A-Z]{3}$')
    amount: Decimal = Field(..., ge=0)


class BudgetUpdate(BaseModel):
    """Schema for updating a budget."""

    amount: Optional[Decimal] = Field(None, ge=0)


class CategoryOut(BaseModel):
    """Schema for category output in budget response."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    budget_period_id: int
    name: str
    created_at: datetime


class BudgetOut(BaseModel):
    """Schema for budget response."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    budget_period_id: int
    category_id: int
    category: CategoryOut
    currency: str
    amount: Decimal
    created_by: Optional[Any] = None
    updated_by: Optional[Any] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    @field_serializer('created_by', 'updated_by')
    def serialize_user(self, value: Any, _info) -> Optional[int]:
        """Serialize User to int (user id)."""
        return int(value.id) if value else None
