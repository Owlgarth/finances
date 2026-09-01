"""Schemas for transactions app."""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from django.utils.translation import gettext as _
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from currencies.schemas import CurrencyCode


class TransactionCreate(BaseModel):
    """Schema for creating or fully replacing a transaction.

    amount is positive for income/expense and a signed non-zero delta for
    adjustments (validated in the service, where the type semantics live).

    account_id is optional. With an account, currency_code is derived from
    the account when omitted and must MATCH it when sent; without an account,
    currency_code is required (and must be an enabled workspace currency).
    Adjustments always require an account - service-validated like the other
    type semantics.

    items is optional (defaults to empty list). When present, the service
    bulk-creates them in the same atomic block as the transaction. Omitting
    it - as planned_transactions/tasks.py does - leaves the transaction with
    zero items, preserving the historical behavior.

    note is optional free text (max 2000 chars). This is a full-replace
    schema: an absent or null note stores None, clearing any previous note.
    """

    date: date
    description: str = Field(..., max_length=500)
    note: Optional[str] = Field(None, max_length=2000)
    type: str = Field(..., pattern=r'^(income|expense|adjustment)$')
    amount: Decimal
    account_id: Optional[int] = None
    currency_code: Optional[CurrencyCode] = None
    category_id: Optional[int] = None
    original_amount: Optional[Decimal] = Field(None, gt=0)
    original_currency_code: Optional[str] = Field(None, pattern=r'^[A-Z]{3,8}$')
    items: list['TransactionItemIn'] = Field(default_factory=list, max_length=200)

    @field_validator('description')
    @classmethod
    def description_not_empty(cls, v):
        if not v.strip():
            raise ValueError(_('Description cannot be empty'))
        return v.strip()

    @model_validator(mode='after')
    def original_facet_both_or_neither(self):
        if (self.original_amount is None) != (self.original_currency_code is None):
            raise ValueError(_('original_amount and original_currency_code must both be set or both be omitted'))
        return self


class TransactionImport(BaseModel):
    """Schema for importing a transaction row."""

    date: date
    description: str = Field(..., max_length=500)
    note: Optional[str] = Field(None, max_length=2000)
    category_name: Optional[str] = Field(None, max_length=100)
    amount: Decimal = Field(..., gt=0)
    type: str = Field(..., pattern=r'^(income|expense)$')

    @field_validator('description')
    @classmethod
    def description_not_empty(cls, v):
        if not v.strip():
            raise ValueError(_('Description cannot be empty'))
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
    account_id: Optional[int] = None
    account_name: Optional[str] = None
    currency_code: str
    date: date
    description: str
    note: Optional[str] = None
    category_id: Optional[int]
    category_name: Optional[str] = None
    category_budget_id: Optional[int] = None
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


class TransactionItemIn(BaseModel):
    """One line item in a replace-all items request. Order in the list is the stored order."""

    name: str = Field(..., max_length=300)
    quantity: Decimal = Field(Decimal('1'), gt=0)
    unit_price: Optional[Decimal] = Field(None, ge=0)
    line_total: Optional[Decimal] = Field(None, ge=0)

    @field_validator('name')
    @classmethod
    def name_not_empty(cls, v):
        if not v.strip():
            raise ValueError(_('Item name cannot be empty'))
        return v.strip()


class TransactionItemsReplace(BaseModel):
    """Full ordered item list for a transaction (add/edit/reorder/delete in one call)."""

    items: list[TransactionItemIn] = Field(..., max_length=200)


class TransactionItemOut(BaseModel):
    """Schema for a stored line item."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    position: int
    name: str
    quantity: Decimal
    unit_price: Optional[Decimal]
    line_total: Optional[Decimal]


class TransactionItemsOut(BaseModel):
    """Item list plus the sum the UI compares against the transaction amount."""

    items: list[TransactionItemOut]
    items_total: Decimal


class TransactionAttachmentOut(BaseModel):
    """Attachment metadata + extraction state (downloads go through the API)."""

    id: int
    filename: str
    content_type: str
    size: int
    created_at: datetime
    extraction_status: str
    extraction_error: str


class ExtractionResultOut(BaseModel):
    """Extraction state plus the parser's contract result (present when status == done)."""

    status: str
    error: str
    result: Optional[dict]


class ExtractionConfigOut(BaseModel):
    """Whether receipt extraction is configured, and whether it is answering now.

    `enabled` drives affordance visibility; `reachable` drives whether they are
    usable — the parser runs on an intermittently-available host, so configured
    but offline is a normal state the UI relabels rather than hides.
    """

    enabled: bool
    reachable: bool
