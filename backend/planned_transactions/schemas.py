"""Schemas for planned_transactions app."""

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from django.utils.translation import gettext as _
from pydantic import BaseModel, ConfigDict, Field, field_validator

from currencies.schemas import CurrencyCode


class PlannedTransactionCreate(BaseModel):
    """Schema for creating or fully replacing a planned transaction.

    currency_code is optional when account_id is set (auto-derived from the
    account in the service) and required when the plan has no account.
    """

    name: str = Field(..., max_length=200)
    amount: Decimal = Field(..., gt=0)
    account_id: Optional[int] = None
    currency_code: Optional[CurrencyCode] = None
    category_id: Optional[int] = None
    planned_date: date
    status: str = Field(default='pending', pattern=r'^(pending|done|cancelled)$')

    @field_validator('name')
    @classmethod
    def name_not_empty(cls, v):
        if not v.strip():
            raise ValueError(_('Name cannot be empty'))
        return v.strip()


class PlannedTransactionImport(BaseModel):
    """Schema for importing a planned transaction."""

    name: str = Field(..., max_length=200)
    amount: Decimal = Field(..., gt=0)
    category_name: Optional[str] = Field(None, max_length=100)
    planned_date: date

    @field_validator('name')
    @classmethod
    def name_not_empty(cls, v):
        if not v.strip():
            raise ValueError(_('Name cannot be empty'))
        return v.strip()


class CategoryOut(BaseModel):
    """Schema for category in planned transaction response."""

    id: int
    budget_id: int
    name: str

    model_config = ConfigDict(from_attributes=True)


class PlannedTransactionOut(BaseModel):
    """Schema for planned transaction response."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    workspace_id: int
    account_id: Optional[int] = None
    account_name: Optional[str] = None
    currency_code: str
    name: str
    amount: Decimal
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


class PlannedTransactionTotalsItem(BaseModel):
    """Schema for a single planned transaction totals group."""

    group: str  # currency code (when group_by=currency) or category name (when group_by=category)
    currency: str
    total: Decimal


class PlannedTransactionTotalsResponse(BaseModel):
    """Schema for planned transaction totals response."""

    totals: list[PlannedTransactionTotalsItem]
