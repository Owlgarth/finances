"""Schemas for transactions app."""

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class TransactionCreate(BaseModel):
    """Schema for creating a transaction."""

    date: date
    description: str = Field(..., max_length=500)
    category_id: Optional[int] = None
    amount: Decimal = Field(..., gt=0)
    currency: str = Field(..., pattern=r'^[A-Z]{3}$')
    type: str = Field(..., pattern=r'^(income|expense)$')
    budget_period_id: Optional[int] = None


class TransactionUpdate(BaseModel):
    """Schema for updating a transaction."""

    date: date
    description: str = Field(..., max_length=500)
    category_id: Optional[int] = None
    amount: Decimal = Field(..., gt=0)
    currency: str = Field(..., pattern=r'^[A-Z]{3}$')
    type: str = Field(..., pattern=r'^(income|expense)$')
    budget_period_id: Optional[int] = None


class TransactionImport(BaseModel):
    """Schema for importing a transaction."""

    date: date
    description: str = Field(..., max_length=500)
    category_name: Optional[str] = Field(None, max_length=100)
    amount: Decimal
    currency: str = Field(..., pattern=r'^[A-Z]{3}$')
    type: str = Field(..., pattern=r'^(income|expense)$')


class CategoryOut(BaseModel):
    """Schema for category in transaction response."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    budget_period_id: int
    name: str
    created_at: datetime


class TransactionOut(BaseModel):
    """Schema for transaction response."""

    model_config = ConfigDict(
        from_attributes=True,
        arbitrary_types_allowed=True,
    )

    id: int
    budget_period_id: Optional[int]
    date: date
    description: str
    category_id: Optional[int]
    category: Optional[CategoryOut] = None
    amount: Decimal
    currency: str
    type: str
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
