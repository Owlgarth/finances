"""GDPR-related schemas for account deletion and data portability."""

from typing import Literal

from pydantic import BaseModel, Field


class AccountDeleteIn(BaseModel):
    """Input for account deletion — requires password confirmation."""

    password: str


class AccountResetIn(BaseModel):
    """Input for account reset — requires password confirmation.

    workspace_name/currency_code shape the fresh workspace created after the wipe.
    confirm_shared must be true when any owned workspace has other members —
    the reset deletes those workspaces out from under them.
    """

    password: str
    workspace_name: str = Field('My Workspace', max_length=100)
    currency_code: str = Field('PLN', pattern=r'^[A-Z]{3,8}$')
    confirm_shared: bool = False


class AccountResetOut(BaseModel):
    """Result of an account reset."""

    message: str
    deleted_workspaces: list[str]
    workspace_id: int
    workspace_name: str


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
    imported_accounts: int
    imported_budgets: int
    imported_categories: int
    imported_transactions: int
    imported_transfers: int
    imported_planned_transactions: int
    skipped: dict[str, list[str]]
    renamed: dict[str, str]


class LegacyImportIn(BaseModel):
    """Input for the legacy (v1/v2) import endpoint."""

    data: dict = Field(..., description='Legacy export JSON data (v1 or v2)')
    conflict_strategy: Literal['rename', 'skip'] = Field(
        'rename',
        description='How to handle workspace name conflicts',
    )


class LegacyBalanceCheck(BaseModel):
    """Per-currency balance verification after a legacy import."""

    currency_code: str
    account_name: str
    expected_closing_balance: str | None
    computed_balance: str
    matches: bool


class LegacyDedupedTransaction(BaseModel):
    """A linked exchange transaction that was skipped to avoid double-counting."""

    date: str | None
    description: str | None
    amount: str
    type: str
    currency_code: str | None


class LegacyImportedBudget(BaseModel):
    """A budget created during a legacy import (for default-budget selection)."""

    id: int
    name: str


class LegacyWorkspaceReport(BaseModel):
    """Verification report for one imported workspace."""

    workspace_id: int
    workspace_name: str
    created: dict[str, int]
    budgets: list[LegacyImportedBudget]
    deduped_transactions: list[LegacyDedupedTransaction]
    balances: list[LegacyBalanceCheck]
    warnings: list[str]


class LegacyImportResultOut(BaseModel):
    """Verification report for a legacy import."""

    workspaces: list[LegacyWorkspaceReport]
    renamed: dict[str, str]
    skipped_workspaces: list[str]
