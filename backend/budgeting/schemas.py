"""Pydantic schemas for the budgeting API."""

import re
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from django.utils.translation import gettext as _
from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator, model_validator

from currencies.schemas import CurrencyCode


class BudgetCreate(BaseModel):
    """Schema for creating a budget."""

    name: str = Field(..., max_length=100)
    description: str | None = None
    color: str | None = Field(None, max_length=7)
    icon: str | None = Field(None, max_length=50)
    is_active: bool = True
    display_order: int = 0
    currency_codes: list[CurrencyCode] = Field(default_factory=list, max_length=10)
    cadence: str = Field(default='monthly', pattern=r'^(monthly|weeks|custom)$')
    cadence_weeks: int | None = Field(None, ge=1, le=52)
    cadence_anchor: date | None = None

    @field_validator('name')
    @classmethod
    def name_not_empty(cls, v):
        if not v.strip():
            raise ValueError(_('Name cannot be empty'))
        return v.strip()

    @field_validator('color')
    @classmethod
    def color_hex_format(cls, v):
        if v is not None and not re.match(r'^#[0-9A-Fa-f]{6}$', v):
            raise ValueError(_('Color must be a valid hex color code (e.g. #FF5733)'))
        return v


class BudgetUpdate(BaseModel):
    """Schema for updating a budget."""

    name: str | None = Field(None, max_length=100)
    description: str | None = None
    color: str | None = Field(None, max_length=7)
    icon: str | None = Field(None, max_length=50)
    is_active: bool | None = None
    display_order: int | None = None
    currency_codes: list[CurrencyCode] | None = Field(None, max_length=10)
    cadence: str | None = Field(None, pattern=r'^(monthly|weeks|custom)$')
    cadence_weeks: int | None = Field(None, ge=1, le=52)
    cadence_anchor: date | None = None

    @field_validator('name')
    @classmethod
    def name_not_empty(cls, v):
        if v is not None and not v.strip():
            raise ValueError(_('Name cannot be empty'))
        return v.strip() if v is not None else v

    @field_validator('color')
    @classmethod
    def color_hex_format(cls, v):
        if v is not None and not re.match(r'^#[0-9A-Fa-f]{6}$', v):
            raise ValueError(_('Color must be a valid hex color code (e.g. #FF5733)'))
        return v


class BudgetArchive(BaseModel):
    """Schema for archiving/unarchiving a budget (is_active flag)."""

    is_active: bool


class BudgetOut(BaseModel):
    """Schema for budget response."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    workspace_id: int
    name: str
    description: str | None
    color: str | None
    icon: str | None
    is_active: bool
    display_order: int
    # Reads the model's `currency_codes` property (ordered list of codes).
    currency_codes: list[str]
    cadence: str
    cadence_weeks: int | None
    cadence_anchor: date | None
    created_at: datetime


class PeriodCreate(BaseModel):
    """Schema for creating a custom period."""

    name: str = Field(..., max_length=100)
    start_date: date
    end_date: date

    @field_validator('name')
    @classmethod
    def name_not_empty(cls, v):
        if not v.strip():
            raise ValueError(_('Name cannot be empty'))
        return v.strip()

    @model_validator(mode='after')
    def end_not_before_start(self):
        if self.end_date < self.start_date:
            raise ValueError(_('end_date must be on or after start_date'))
        return self


class PeriodUpdate(BaseModel):
    """Schema for updating a custom period."""

    name: str | None = Field(None, max_length=100)
    start_date: date | None = None
    end_date: date | None = None

    @field_validator('name')
    @classmethod
    def name_not_empty(cls, v):
        if v is not None and not v.strip():
            raise ValueError(_('Name cannot be empty'))
        return v.strip() if v is not None else v


class PeriodOut(BaseModel):
    """Schema for period response."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    budget_id: int
    name: str
    start_date: date
    end_date: date
    is_custom: bool


class CategoryBudgetSet(BaseModel):
    """Schema for upserting a planned amount (period × category × currency)."""

    category_id: int
    currency_code: CurrencyCode
    amount: Decimal = Field(..., ge=0)


class CategoryBudgetOut(BaseModel):
    """Schema for a planned amount response."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    period_id: int
    category_id: int
    # Reads the model's `currency` FK; the validator reduces it to its code.
    currency_code: str = Field(validation_alias=AliasChoices('currency_code', 'currency'))
    amount: Decimal

    @field_validator('currency_code', mode='before')
    @classmethod
    def extract_currency_code(cls, value: Any) -> str:
        if hasattr(value, 'code'):
            return value.code
        return value
