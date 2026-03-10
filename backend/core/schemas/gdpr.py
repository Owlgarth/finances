"""GDPR-related schemas for account deletion and data portability."""

from pydantic import BaseModel


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
