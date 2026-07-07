"""Schemas for transactions app."""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class TransactionCreate(BaseModel):
    """Schema for creating or fully replacing a transaction.

    amount is positive for income/expense and a signed non-zero delta for
    adjustments (validated in the service, where the type semantics live).
    """

    date: date
    description: str = Field(..., max_length=500)
    type: str = Field(..., pattern=r'^(income|expense|adjustment)$')
    amount: Decimal
    account_id: Optional[int] = None
    category_id: Optional[int] = None
    original_amount: Optional[Decimal] = Field(None, gt=0)
    original_currency_code: Optional[str] = Field(None, pattern=r'^[A-Z]{3,8}$')

    @field_validator('description')
    @classmethod
    def description_not_empty(cls, v):
        if not v.strip():
            raise ValueError('Description cannot be empty')
        return v.strip()

    @model_validator(mode='after')
    def original_facet_both_or_neither(self):
        if (self.original_amount is None) != (self.original_currency_code is None):
            raise ValueError('original_amount and original_currency_code must both be set or both be omitted')
        return self


class TransactionImport(BaseModel):
    """Schema for importing a transaction row."""

    date: date
    description: str = Field(..., max_length=500)
    category_name: Optional[str] = Field(None, max_length=100)
    amount: Decimal = Field(..., gt=0)
    type: str = Field(..., pattern=r'^(income|expense)$')

    @field_validator('description')
    @classmethod
    def description_not_empty(cls, v):
        if not v.strip():
            raise ValueError('Description cannot be empty')
        return v.strip()


class TransactionBulkAccountIn(BaseModel):
    """Schema for bulk account reassignment."""

    transaction_ids: list[int] = Field(..., min_length=1)
    account_id: int


class TransactionBulkAccountOut(BaseModel):
    """Schema for bulk account reassignment response."""

    updated: int


class TransactionOut(BaseModel):
    """Schema for transaction response."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    workspace_id: int
    account_id: int
    account_name: str
    currency_code: str
    date: date
    description: str
    category_id: Optional[int]
    category_name: Optional[str] = None
    amount: Decimal
    type: str
    original_amount: Optional[Decimal] = None
    original_currency_code: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class TransactionTotalsItem(BaseModel):
    """Schema for a single totals group."""

    group: str  # "income"/"expense" (when group_by=type) or category name (when group_by=category)
    currency: str
    total: Decimal


class TransactionTotalsResponse(BaseModel):
    """Schema for transaction totals response.

    The fields are mutually exclusive depending on the group_by value:
    - group_by='type' or 'category' → only 'totals' is populated
    - group_by='type,category' → only 'by_type' and 'by_category' are populated
    """

    totals: list[TransactionTotalsItem] | None = None
    by_type: list[TransactionTotalsItem] | None = None
    by_category: list[TransactionTotalsItem] | None = None


class FrequentDescriptionItem(BaseModel):
    """Schema for a single frequent description item."""

    description: str
    count: int
    total: Decimal
    currency: str


class FrequentDescriptionsResponse(BaseModel):
    """Schema for frequent descriptions response."""

    items: list[FrequentDescriptionItem]
