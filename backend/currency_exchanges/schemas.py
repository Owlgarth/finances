"""Schemas for currency_exchanges app."""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class CurrencyExchangeCreate(BaseModel):
    """Schema for creating a currency exchange."""

    date: date
    description: Optional[str] = None
    from_currency: str = Field(..., pattern=r'^[A-Z]{3}$')
    from_amount: Decimal = Field(..., gt=0)
    to_currency: str = Field(..., pattern=r'^[A-Z]{3}$')
    to_amount: Decimal = Field(..., gt=0)


class CurrencyExchangeUpdate(BaseModel):
    """Schema for updating a currency exchange."""

    date: date
    description: Optional[str] = None
    from_currency: str = Field(..., pattern=r'^[A-Z]{3}$')
    from_amount: Decimal = Field(..., gt=0)
    to_currency: str = Field(..., pattern=r'^[A-Z]{3}$')
    to_amount: Decimal = Field(..., gt=0)


class CurrencyExchangeImport(BaseModel):
    """Schema for importing a currency exchange."""

    date: date
    description: Optional[str] = None
    from_currency: str = Field(..., pattern=r'^[A-Z]{3}$')
    from_amount: Decimal = Field(..., gt=0)
    to_currency: str = Field(..., pattern=r'^[A-Z]{3}$')
    to_amount: Decimal = Field(..., gt=0)


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
