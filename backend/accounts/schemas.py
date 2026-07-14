"""Pydantic schemas for the accounts API."""

from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator


class AccountCreate(BaseModel):
    """Schema for creating an account."""

    name: str = Field(..., max_length=100)
    type: str = Field(default='bank', pattern=r'^(cash|bank|other)$')
    currency_code: str = Field(..., pattern=r'^[A-Z]{3,8}$')
    opening_balance: Decimal = Field(default=Decimal('0'))
    display_order: int = 0

    @field_validator('name')
    @classmethod
    def name_not_empty(cls, v):
        if not v.strip():
            raise ValueError('Name cannot be empty')
        return v.strip()


class AccountUpdate(BaseModel):
    """Schema for updating an account. Currency is immutable after creation."""

    name: str | None = Field(None, max_length=100)
    type: str | None = Field(None, pattern=r'^(cash|bank|other)$')
    currency_code: str | None = Field(None, pattern=r'^[A-Z]{3,8}$')
    opening_balance: Decimal | None = None
    display_order: int | None = None

    @field_validator('name')
    @classmethod
    def name_not_empty(cls, v):
        if v is not None and not v.strip():
            raise ValueError('Name cannot be empty')
        return v.strip() if v is not None else v


class AccountArchive(BaseModel):
    """Schema for archiving/unarchiving an account."""

    is_archived: bool


class AccountOut(BaseModel):
    """Schema for account response."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    workspace_id: int
    name: str
    type: str
    # Reads the model's `currency` FK; the validator below reduces it to its code.
    currency_code: str = Field(validation_alias=AliasChoices('currency_code', 'currency'))
    opening_balance: Decimal
    is_archived: bool
    display_order: int
    created_at: datetime

    @field_validator('currency_code', mode='before')
    @classmethod
    def extract_currency_code(cls, value: Any) -> str:
        """Extract code string from a catalog Currency FK object."""
        if hasattr(value, 'code'):
            return value.code
        return value


class AccountBalanceOut(BaseModel):
    """Schema for the computed account balance response."""

    account_id: int
    currency_code: str
    balance: Decimal
