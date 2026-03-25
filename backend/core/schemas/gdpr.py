"""GDPR-related schemas for account deletion and data portability."""

from typing import Literal

from pydantic import BaseModel, Field


class AccountDeleteIn(BaseModel):
    """Input for account deletion — requires password confirmation."""

    password: str


class BlockingWorkspace(BaseModel):
    """A workspace that blocks account deletion (user owns it + other members exist)."""

    id: int
    name: str
    member_count: int


class AccountDeleteCheckOut(BaseModel):
    """Pre-deletion check showing what will be affected."""

    can_delete: bool
    blocking_workspaces: list[BlockingWorkspace] | None = None
    solo_workspaces: list[str]
    shared_workspace_memberships: int
    total_transactions: int
    total_planned_transactions: int
    total_currency_exchanges: int


class AccountDeleteOut(BaseModel):
    """Output confirming account deletion."""

    message: str
    deleted_workspaces: list[str]


class FullImportIn(BaseModel):
    """Schema for full account import."""

    data: dict = Field(..., description='Full export JSON data')
    workspaces: list[str] | None = Field(
        None,
        description='Filter to specific workspace names. None = import all.',
    )
    conflict_strategy: Literal['rename', 'skip', 'merge'] = Field(
        'rename',
        description='How to handle workspace name conflicts',
    )


class ImportResultOut(BaseModel):
    """Schema for import result."""

    imported_workspaces: int
    imported_budget_accounts: int
    imported_budget_periods: int
    imported_categories: int
    imported_transactions: int
    imported_budgets: int
    imported_planned_transactions: int
    imported_currency_exchanges: int
    skipped: dict[str, list[str]]
    renamed: dict[str, str]
