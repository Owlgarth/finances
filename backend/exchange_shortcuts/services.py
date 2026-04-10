from django.conf import settings

from common.services.base import resolve_currency
from exchange_shortcuts.exceptions import (
    ExchangeShortcutCurrencyNotInWorkspaceError,
    ExchangeShortcutDuplicateError,
    ExchangeShortcutLimitError,
    ExchangeShortcutNotFoundError,
)
from exchange_shortcuts.models import ExchangeShortcut
from exchange_shortcuts.schemas import ExchangeShortcutCreate, ExchangeShortcutUpdate


class ExchangeShortcutService:
    @staticmethod
    def get_shortcut(shortcut_id: int, workspace_id: int) -> ExchangeShortcut:
        shortcut = ExchangeShortcut.objects.for_workspace(workspace_id).filter(id=shortcut_id).first()
        if not shortcut:
            raise ExchangeShortcutNotFoundError()
        return shortcut

    @staticmethod
    def list(workspace_id: int) -> list[ExchangeShortcut]:
        return list(ExchangeShortcut.objects.for_workspace(workspace_id).order_by('created_at'))

    @staticmethod
    def create(user, workspace_id: int, data: ExchangeShortcutCreate) -> ExchangeShortcut:
        max_shortcuts = settings.EXCHANGE_SHORTCUTS_MAX_PER_WORKSPACE
        current_count = ExchangeShortcut.objects.for_workspace(workspace_id).count()
        if current_count >= max_shortcuts:
            raise ExchangeShortcutLimitError()

        from_currency = resolve_currency(workspace_id, data.from_currency)
        if not from_currency:
            raise ExchangeShortcutCurrencyNotInWorkspaceError(data.from_currency)

        to_currency = resolve_currency(workspace_id, data.to_currency)
        if not to_currency:
            raise ExchangeShortcutCurrencyNotInWorkspaceError(data.to_currency)

        if (
            ExchangeShortcut.objects.for_workspace(workspace_id)
            .filter(from_currency=data.from_currency, to_currency=data.to_currency)
            .exists()
        ):
            raise ExchangeShortcutDuplicateError()

        return ExchangeShortcut.objects.create(
            workspace_id=workspace_id,
            from_currency=data.from_currency,
            to_currency=data.to_currency,
            created_by=user,
            updated_by=user,
        )

    @staticmethod
    def update(user, workspace_id: int, shortcut_id: int, data: ExchangeShortcutUpdate) -> ExchangeShortcut:
        shortcut = ExchangeShortcutService.get_shortcut(shortcut_id, workspace_id)

        from_currency = resolve_currency(workspace_id, data.from_currency)
        if not from_currency:
            raise ExchangeShortcutCurrencyNotInWorkspaceError(data.from_currency)

        to_currency = resolve_currency(workspace_id, data.to_currency)
        if not to_currency:
            raise ExchangeShortcutCurrencyNotInWorkspaceError(data.to_currency)

        if (
            ExchangeShortcut.objects.for_workspace(workspace_id)
            .filter(from_currency=data.from_currency, to_currency=data.to_currency)
            .exclude(id=shortcut_id)
            .exists()
        ):
            raise ExchangeShortcutDuplicateError()

        shortcut.from_currency = data.from_currency
        shortcut.to_currency = data.to_currency
        shortcut.updated_by = user
        shortcut.save()
        return shortcut

    @staticmethod
    def delete(workspace_id: int, shortcut_id: int) -> None:
        shortcut = ExchangeShortcutService.get_shortcut(shortcut_id, workspace_id)
        shortcut.delete()
