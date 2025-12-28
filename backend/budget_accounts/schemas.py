"""Pydantic schemas for budget_accounts API."""

from datetime import datetime

from pydantic import BaseModel, Field


class BudgetAccountCreate(BaseModel):
    """Schema for creating a budget account."""

    name: str = Field(max_length=100)
    description: str | None = None
    default_currency: str = Field(default='PLN', pattern='^[A-Z]{3}$')
    color: str | None = Field(None, max_length=7)
    icon: str | None = Field(None, max_length=50)
    is_active: bool = True
    display_order: int = 0


class BudgetAccountUpdate(BaseModel):
    """Schema for updating a budget account."""

    name: str | None = Field(None, max_length=100)
    description: str | None = None
    default_currency: str | None = Field(None, pattern='^[A-Z]{3}$')
    color: str | None = Field(None, max_length=7)
    icon: str | None = Field(None, max_length=50)
    is_active: bool | None = None
    display_order: int | None = None


class BudgetAccountOut(BaseModel):
    """Schema for budget account output - matches frontend BudgetAccount interface."""

    id: int
    workspace_id: int
    name: str
    description: str | None
    default_currency: str
    color: str | None
    icon: str | None
    is_active: bool
    display_order: int
    created_at: datetime

    class Config:
        from_attributes = True
