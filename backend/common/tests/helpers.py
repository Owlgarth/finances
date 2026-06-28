"""Shared test helpers for cross-cutting test setup.

Provides helpers that reduce boilerplate in tests needing a fully independent
second workspace (e.g. cross-workspace isolation tests). Builds on the Factory
Boy factories rather than calling ``Model.objects.create`` directly, per the
AGENTS.md "Test Data: Prefer Factories Over Service Calls" rule.
"""

from budget_accounts.models import BudgetAccount
from common.tests.factories import BudgetAccountFactory, UserFactory
from users.models import User
from workspaces.factories import WorkspaceFactory, WorkspaceMemberFactory
from workspaces.models import Currency, Workspace


def create_other_workspace(
    *,
    owner_email: str = 'other@example.com',
    workspace_name: str = 'Other Workspace',
    account_name: str = 'Other Account',
    role: str = 'owner',
) -> tuple[Workspace, User, BudgetAccount, dict[str, Currency]]:
    """Create a fully independent second workspace for cross-workspace tests.

    Builds a workspace, its owner (user + membership), and a budget account
    using factories. The workspace gets its own currencies via
    ``WorkspaceFactory``'s ``post_generation`` hook (USD, UAH, PLN, EUR).

    Unlike the copy-pasted boilerplate it replaces, the returned account and
    ``currencies`` belong to the *new* workspace — not the calling test's
    ``self.workspace``. This avoids cross-workspace currency contamination
    (a ws-2 account must never reference a ws-1 currency).

    Note: the created user has no usable password (``UserFactory`` does not set
    one). Cross-workspace isolation tests only use the user as ``created_by`` /
    owner, so this is fine. If a future caller needs to authenticate as this
    user, set a password explicitly.

    Args:
        owner_email: Email for the new workspace's owner user.
        workspace_name: Name of the new workspace.
        account_name: Name of the budget account created in the new workspace.
        role: Role for the owner's workspace membership (default ``'owner'``).

    Returns:
        ``(workspace, user, account, currencies)`` where ``currencies`` is a
        dict keyed by currency symbol, e.g. ``{'PLN': Currency, 'USD': ...}``.
    """
    workspace = WorkspaceFactory(name=workspace_name)
    user = UserFactory(email=owner_email, current_workspace=workspace)

    # WorkspaceFactory does not set owner; mirror AuthMixin's setup.
    workspace.owner = user
    workspace.save()

    WorkspaceMemberFactory(workspace=workspace, user=user, role=role)

    currencies = {c.symbol: c for c in workspace.currencies.all()}
    account = BudgetAccountFactory(
        workspace=workspace,
        name=account_name,
        default_currency=currencies['PLN'],
        is_active=True,
        display_order=0,
        created_by=user,
    )

    return workspace, user, account, currencies
