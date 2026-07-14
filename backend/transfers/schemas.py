"""Pydantic schemas for the transfers API."""

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class TransferCreate(BaseModel):
    """Schema for creating or fully replacing a transfer.

    to_amount may be omitted for same-currency transfers (defaults to
    from_amount); it is required for cross-currency transfers.
    """

    from_account_id: int
    to_account_id: int
    from_amount: Decimal = Field(..., gt=0)
    to_amount: Optional[Decimal] = Field(None, gt=0)
    date: date
    description: str = Field('', max_length=500)

    @model_validator(mode='after')
    def accounts_must_differ(self):
        if self.from_account_id == self.to_account_id:
            raise ValueError('From and to accounts must differ')
        return self


class TransferOut(BaseModel):
    """Schema for transfer response.

    rate is the implied exchange rate (to_amount / from_amount), present only
    for cross-currency transfers — it is computed, never stored.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    workspace_id: int
    from_account_id: int
    from_account_name: str
    from_currency_code: str
    from_amount: Decimal
    to_account_id: int
    to_account_name: str
    to_currency_code: str
    to_amount: Decimal
    date: date
    description: str
    rate: str | None = None
    created_at: datetime

    @model_validator(mode='before')
    @classmethod
    def compute_derived_fields(cls, value: Any):
        if isinstance(value, dict):
            return value
        # ORM instance: derive account/currency fields and the implied rate.
        derived = {
            'id': value.id,
            'workspace_id': value.workspace_id,
            'from_account_id': value.from_account_id,
            'from_account_name': value.from_account.name,
            'from_currency_code': value.from_account.currency.code,
            'from_amount': value.from_amount,
            'to_account_id': value.to_account_id,
            'to_account_name': value.to_account.name,
            'to_currency_code': value.to_account.currency.code,
            'to_amount': value.to_amount,
            'date': value.date,
            'description': value.description,
            'created_at': value.created_at,
            'rate': None,
        }
        if value.from_account.currency_id != value.to_account.currency_id:
            derived['rate'] = str((value.to_amount / value.from_amount).quantize(Decimal('0.000001')))
        return derived

    @field_validator('rate', mode='before')
    @classmethod
    def rate_to_str(cls, v):
        if v is None:
            return None
        return str(v)
