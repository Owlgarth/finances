from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ExchangeShortcutCreate(BaseModel):
    from_currency: str = Field(..., pattern=r'^[A-Z]{3}$')
    to_currency: str = Field(..., pattern=r'^[A-Z]{3}$')

    @field_validator('to_currency')
    @classmethod
    def currencies_differ(cls, v, info):
        if 'from_currency' in info.data and v == info.data['from_currency']:
            raise ValueError('from_currency and to_currency must be different')
        return v


class ExchangeShortcutUpdate(BaseModel):
    from_currency: str = Field(..., pattern=r'^[A-Z]{3}$')
    to_currency: str = Field(..., pattern=r'^[A-Z]{3}$')

    @field_validator('to_currency')
    @classmethod
    def currencies_differ(cls, v, info):
        if 'from_currency' in info.data and v == info.data['from_currency']:
            raise ValueError('from_currency and to_currency must be different')
        return v


class ExchangeShortcutOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    from_currency: str
    to_currency: str
    created_at: datetime
