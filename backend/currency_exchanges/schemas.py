"""Schemas for currency_exchanges app."""

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CurrencyExchangeBase(BaseModel):
    """Base schema for currency exchange with shared validation."""

    date: date
    description: Optional[str] = None
    from_currency: str = Field(..., pattern=r'^[A-Z]{3}$')
    from_amount: Decimal = Field(..., gt=0)
    to_currency: str = Field(..., pattern=r'^[A-Z]{3}$')
    to_amount: Decimal = Field(..., gt=0)

    @field_validator('to_currency')
    @classmethod
    def currencies_differ(cls, v, info):
        if 'from_currency' in info.data and v == info.data['from_currency']:
            raise ValueError('from_currency and to_currency must be different')
        return v


class CurrencyExchangeCreate(CurrencyExchangeBase):
    """Schema for creating a currency exchange."""


class CurrencyExchangeUpdate(CurrencyExchangeBase):
    """Schema for updating a currency exchange."""


class CurrencyExchangeImport(CurrencyExchangeBase):
    """Schema for importing a currency exchange."""


class CurrencyExchangeOut(BaseModel):
    """Schema for currency exchange response - matches frontend CurrencyExchange interface."""

    model_config = ConfigDict(
        from_attributes=True,
        arbitrary_types_allowed=True,
    )

    id: int
    budget_period_id: Optional[int]
    date: date
    description: Optional[str]
    from_currency: str
    from_amount: Decimal
    to_currency: str
    to_amount: Decimal
    exchange_rate: Optional[Decimal]
    created_at: datetime

    @field_validator('from_currency', 'to_currency', mode='before')
    @classmethod
    def validate_currency(cls, value: Any) -> str:
        """Extract symbol string from Currency FK object."""
        if hasattr(value, 'symbol'):
            return value.symbol
        return value
