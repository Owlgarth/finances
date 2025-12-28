"""Schemas for planned_transactions app."""

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PlannedTransactionCreate(BaseModel):
    """Schema for creating a planned transaction."""

    name: str = Field(..., max_length=200)
    amount: Decimal = Field(..., gt=0)
    currency: str = Field(..., pattern=r'^[A-Z]{3}$')
    category_id: Optional[int] = None
    planned_date: date
    status: str = Field(default='pending', pattern=r'^(pending|done|cancelled)$')
    budget_period_id: Optional[int] = None


class PlannedTransactionUpdate(BaseModel):
    """Schema for updating a planned transaction."""

    name: str = Field(..., max_length=200)
    amount: Decimal = Field(..., gt=0)
    currency: str = Field(..., pattern=r'^[A-Z]{3}$')
    category_id: Optional[int] = None
    planned_date: date
    status: str = Field(default='pending', pattern=r'^(pending|done|cancelled)$')
    budget_period_id: Optional[int] = None


class PlannedTransactionImport(BaseModel):
    """Schema for importing a planned transaction."""

    name: str = Field(..., max_length=200)
    amount: Decimal = Field(..., gt=0)
    currency: str = Field(..., pattern=r'^[A-Z]{3}$')
    category_name: Optional[str] = Field(None, max_length=100)
    planned_date: date


class CategoryOut(BaseModel):
    """Schema for category in planned transaction response."""

    id: int
    budget_period_id: int
    name: str

    model_config = ConfigDict(from_attributes=True)


class PlannedTransactionOut(BaseModel):
    """Schema for planned transaction response."""

    model_config = ConfigDict(
        from_attributes=True,
        arbitrary_types_allowed=True,
    )

    id: int
    budget_period_id: Optional[int]
    name: str
    amount: Decimal
    currency: str
    category_id: Optional[int]
    category: Optional[CategoryOut] = None
    planned_date: date
    payment_date: Optional[date]
    status: str
    transaction_id: Optional[int]
    created_by: Optional[int] = None
    updated_by: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    @field_validator('created_by', 'updated_by', mode='before')
    @classmethod
    def validate_user_id(cls, value: Any) -> Optional[int]:
        """Extract user ID from Django User ForeignKey field."""
        if value is None:
            return None
        if hasattr(value, 'id'):
            return value.id
        if isinstance(value, int):
            return value
        return None
