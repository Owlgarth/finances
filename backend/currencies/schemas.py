"""Pydantic schemas for the currencies API."""

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


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
    decimals: int = Field(2, ge=0, le=4)

    @field_validator('name', 'symbol')
    @classmethod
    def strip_not_blank(cls, v):
        if v is None:
            return v
        if not v.strip():
            raise ValueError('Value cannot be blank')
        return v.strip()

    @model_validator(mode='after')
    def custom_requires_name_and_symbol(self):
        if self.custom and (self.name is None or self.symbol is None):
            raise ValueError('name and symbol are required when creating a custom currency')
        return self
