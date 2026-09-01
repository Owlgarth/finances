"""Pydantic schemas for the currencies API."""

from typing import Annotated

from django.utils.translation import gettext as _
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# Shared validated ISO code type - budgeting and workspaces schemas import this.
CurrencyCode = Annotated[str, Field(pattern=r'^[A-Z]{3,8}$')]


class CurrencyCatalogOut(BaseModel):
    """Schema for a catalog currency response."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    symbol: str
    decimals: int
    is_custom: bool


class EnableCurrencyIn(BaseModel):
    """Schema for enabling a catalog currency or creating a custom one.

    With custom=False (default) only code is used. With custom=True,
    name and symbol are required and a workspace-owned currency is created.
    """

    code: str = Field(..., pattern=r'^[A-Z]{3,8}$')
    custom: bool = False
    name: str | None = Field(None, max_length=64)
    symbol: str | None = Field(None, max_length=8)

    @field_validator('name', 'symbol')
    @classmethod
    def strip_not_blank(cls, v):
        if v is None:
            return v
        if not v.strip():
            raise ValueError(_('Value cannot be blank'))
        return v.strip()

    @model_validator(mode='after')
    def custom_requires_name_and_symbol(self):
        if self.custom and (self.name is None or self.symbol is None):
            raise ValueError(_('name and symbol are required when creating a custom currency'))
        return self


class EnabledCurrenciesOrderIn(BaseModel):
    """Schema for reordering the workspace's enabled currencies.

    ``currency_codes`` must be a permutation of the currently-enabled set
    (same members, any order). The cap mirrors WorkspaceCreate.currency_codes
    (20); a workspace that enabled more cannot be reordered through this
    endpoint - disable something first.
    """

    currency_codes: list[CurrencyCode] = Field(..., min_length=1, max_length=20)
