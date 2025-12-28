"""Pydantic schemas for budget periods API."""

from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class BudgetPeriodBase(BaseModel):
    """Base schema for budget period."""

    name: str = Field(..., max_length=100)
    start_date: date
    end_date: date
    weeks: Optional[int] = None

    @field_validator('end_date')
    @classmethod
    def end_date_after_start_date(cls, v, info):
        if 'start_date' in info.data and v < info.data['start_date']:
            raise ValueError('end_date must be on or after start_date')
        return v


class BudgetPeriodCreate(BudgetPeriodBase):
    """Schema for creating a budget period."""

    budget_account_id: int


class BudgetPeriodCopy(BaseModel):
    """Schema for copying a budget period."""

    name: str = Field(..., max_length=100)
    start_date: date
    end_date: date
    weeks: Optional[int] = None


class BudgetPeriodUpdate(BaseModel):
    """Schema for updating a budget period."""

    name: Optional[str] = Field(None, max_length=100)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    weeks: Optional[int] = None
    budget_account_id: Optional[int] = None


class BudgetPeriodOut(BaseModel):
    """Schema for budget period response."""

    model_config = ConfigDict(
        from_attributes=True,
        # Use arbitrary_types_allowed to accept User objects
        arbitrary_types_allowed=True,
    )

    id: int
    budget_account_id: int
    name: str
    start_date: date
    end_date: date
    weeks: Optional[int] = None
    created_by: Optional[int] = None
    updated_by: Optional[int] = None
    created_at: datetime

    @field_validator('created_by', 'updated_by', mode='before')
    @classmethod
    def validate_user_id(cls, value: Any) -> Optional[int]:
        """Extract user ID from Django User ForeignKey field."""
        if value is None:
            return None
        if hasattr(value, 'id'):
            return value.id
        if isinstance(value, int):
            return value
        return None
