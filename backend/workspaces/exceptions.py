"""Domain exceptions for the workspaces app."""

from django.conf import settings

from common.exceptions import NotFoundError, PermissionDeniedError, ValidationError


class CurrencyNotFoundError(NotFoundError):
    default_message = 'Currency not found'
    default_code = 'not_found'


class CurrencyDuplicateSymbolError(ValidationError):
    def __init__(self, symbol: str):
        super().__init__(f'Currency with symbol {symbol} already exists in this workspace', code='duplicate_symbol')


class WorkspaceNotFoundError(NotFoundError):
    default_message = 'Workspace not found'


class WorkspaceMemberNotFoundError(NotFoundError):
    default_message = 'Member not found in this workspace'


class WorkspaceMemberAlreadyExistsError(ValidationError):
    default_message = 'User is already a member of this workspace'


class WorkspaceMemberLimitReachedError(ValidationError):
    def __init__(self):
        super().__init__(
            f'Workspace member limit reached. Maximum {settings.WORKSPACE_MAX_MEMBERS} members allowed per workspace.',
            code='member_limit_reached',
        )


class WorkspaceMemberCannotRemoveSelfError(ValidationError):
    default_message = 'Cannot remove yourself. Use the leave endpoint instead.'


class WorkspaceMemberCannotChangeOwnRoleError(ValidationError):
    default_message = 'Cannot change your own role'


class WorkspaceOwnerCannotLeaveError(ValidationError):
    default_message = 'Workspace owner cannot leave. Transfer ownership first or delete the workspace.'


class WorkspaceOwnerRoleChangeError(ValidationError):
    default_message = "Cannot change the owner's role"


class WorkspaceOwnerRemoveError(ValidationError):
    default_message = 'Cannot remove the workspace owner'


class WorkspaceMemberPasswordRequiredError(ValidationError):
    default_message = 'Password is required when adding a new user.'


class WorkspaceMemberCannotResetOwnPasswordError(ValidationError):
    default_message = 'Cannot reset your own password. Use the change password feature instead.'


class WorkspaceOwnerPasswordResetError(ValidationError):
    default_message = "Cannot reset the owner's password"


class WorkspacePermissionDeniedError(PermissionDeniedError):
    default_message = 'Only the workspace owner can perform this action.'
    default_code = 'workspace_permission_denied'


class WorkspaceMemberAdminInsufficientError(PermissionDeniedError):
    def __init__(self, action: str = 'modify'):
        super().__init__(f'Admin cannot {action} another admin. Owner required.')
