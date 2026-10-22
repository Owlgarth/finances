"""Schemas for planned_transactions app."""

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Any, Optional

from django.utils.translation import gettext as _
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, field_validator

from currencies.schemas import CurrencyCode


def _extract_user_id(value: Any) -> Optional[int]:
    """Extract a user ID from a Django User ForeignKey value (instance or raw id)."""
    if value is None:
        return None
    if hasattr(value, 'id'):
        return value.id
    if isinstance(value, int):
        return value
    return None


UserIdOut = Annotated[Optional[int], BeforeValidator(_extract_user_id)]


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
    """Schema for planned transaction response.

    recurring_id is set when the row was materialized by (or adopted into) a
    recurring rule - the frontend recurring badge keys on it.
    """

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
    recurring_id: Optional[int] = None
    created_by: UserIdOut = None
    updated_by: UserIdOut = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class PlannedTransactionTotalsItem(BaseModel):
    """Schema for a single planned transaction totals group."""

    group: str  # currency code (when group_by=currency) or category name (when group_by=category)
    currency: str
    total: Decimal


class PlannedTransactionTotalsResponse(BaseModel):
    """Schema for planned transaction totals response."""

    totals: list[PlannedTransactionTotalsItem]


class RecurringTransactionCreate(BaseModel):
    """Schema for creating or fully replacing a recurring transaction rule.

    currency_code follows the planned-transaction contract: optional when
    account_id is set (derived from the account in the service), required
    when the rule has no account. adopt_planned_id is create-only - it
    adopts an existing pending planned transaction as the rule's first
    occurrence ("make recurring" conversion); the service rejects it on
    update. is_active rides the payload on create and update alike, so
    pause/resume is a plain full-replace PUT, not a dedicated endpoint
    (an omitted is_active stores the default True - full-replace
    semantics, same as every other absent field).
    """

    name: str = Field(..., max_length=200)
    amount: Decimal = Field(..., gt=0)
    account_id: Optional[int] = None
    currency_code: Optional[CurrencyCode] = None
    category_id: Optional[int] = None
    interval_kind: str = Field(..., pattern=r'^(daily|weekly|monthly)$')
    interval_count: int = Field(1, ge=1)
    start_date: date
    lead_days: int = Field(4, ge=0, le=31)
    end_date: Optional[date] = None
    adopt_planned_id: Optional[int] = None
    is_active: bool = True

    @field_validator('name')
    @classmethod
    def name_not_empty(cls, v):
        if not v.strip():
            raise ValueError(_('Name cannot be empty'))
        return v.strip()


class RecurringTransactionOut(BaseModel):
    """Schema for recurring transaction rule response."""

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
    interval_kind: str
    interval_count: int
    start_date: date
    lead_days: int
    end_date: Optional[date] = None
    is_active: bool
    last_generated_date: Optional[date] = None
    next_occurrence_date: Optional[date] = None
    pending_planned_count: int = 0
    created_by: UserIdOut = None
    updated_by: UserIdOut = None
    created_at: datetime
    updated_at: Optional[datetime] = None
