"""Shared test helpers for cross-cutting test setup.

Provides helpers that reduce boilerplate in tests needing a fully independent
second workspace (e.g. cross-workspace isolation tests). Builds on the Factory
Boy factories rather than calling ``Model.objects.create`` directly.
"""

from accounts.factories import AccountFactory
from accounts.models import Account
from common.tests.factories import UserFactory
from users.models import User
from workspaces.factories import WorkspaceFactory, WorkspaceMemberFactory
from workspaces.models import Workspace


def create_other_workspace(
    *,
    owner_email: str = 'other@example.com',
    workspace_name: str = 'Other Workspace',
    account_name: str = 'Other Account',
    role: str = 'owner',
) -> tuple[Workspace, User, Account]:
    """Create a fully independent second workspace for cross-workspace tests.

    Builds a workspace, its owner (user + membership), and an account (global
    PLN catalog currency) using factories.

    Note: the created user has no usable password (``UserFactory`` does not set
    one). Cross-workspace isolation tests only use the user as ``created_by`` /
    owner, so this is fine. If a future caller needs to authenticate as this
    user, set a password explicitly.

    Returns:
        ``(workspace, user, account)``.
    """
    workspace = WorkspaceFactory(name=workspace_name)
    user = UserFactory(email=owner_email, current_workspace=workspace)

    # WorkspaceFactory does not set owner; mirror AuthMixin's setup.
    workspace.owner = user
    workspace.save()

    WorkspaceMemberFactory(workspace=workspace, user=user, role=role)

    account = AccountFactory(workspace=workspace, name=account_name, created_by=user)

    return workspace, user, account
