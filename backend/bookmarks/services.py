"""Business logic for the bookmarks app (personal quick-access links)."""

from django.db import transaction as db_transaction
from django.db.models import Max, Q
from django.utils.translation import gettext as _

from bookmarks.exceptions import (
    BookmarkBudgetNotFoundError,
    BookmarkBudgetTargetRequiredError,
    BookmarkCurrencyNotEnabledError,
    BookmarkDuplicateNameError,
    BookmarkFilterTargetNotAllowedError,
    BookmarkInvalidTargetError,
    BookmarkNotFoundError,
)
from bookmarks.models import Bookmark, BookmarkKind
from bookmarks.schemas import BookmarkCreate, BookmarkUpdate, BookmarkVisibility
from budgeting.models import Budget
from common.exceptions import ValidationError
from currencies.services import CurrencyCatalogService


class BookmarkService:
    @staticmethod
    def _next_position(user, workspace_id: int) -> int:
        """Position for a new bookmark: append at the end of the user's own list (0 first)."""
        current_max = Bookmark.objects.filter(user=user, workspace_id=workspace_id).aggregate(Max('position'))[
            'position__max'
        ]
        return 0 if current_max is None else current_max + 1

    @staticmethod
    def _check_ci_duplicate(user, workspace_id: int, name: str, exclude_id: int | None = None) -> None:
        queryset = Bookmark.objects.filter(user=user, workspace_id=workspace_id, name__iexact=name)
        if exclude_id is not None:
            queryset = queryset.exclude(id=exclude_id)
        if queryset.exists():
            raise BookmarkDuplicateNameError()

    @staticmethod
    def _validate_target(workspace_id: int, data: BookmarkCreate) -> Budget | None:
        """Validate kind/field coherence; resolve the budget FK for kind=budget.

        For budget bookmarks the budget must belong to the workspace and the
        currency must be enabled in the workspace. The currency is
        deliberately NOT checked against the budget's own currency set: the
        design contract keeps the check loose so a stale bookmark degrades
        gracefully on the page instead of being rejected at save time.
        Returns the resolved Budget, or None for filter kinds.

        Runs before the name-duplicate check: a target error is the more
        specific mistake (resolution order is a UX contract).
        """
        if data.kind == BookmarkKind.BUDGET:
            if data.budget_id is None or data.currency_code is None:
                raise BookmarkBudgetTargetRequiredError()
            if data.params:
                raise BookmarkInvalidTargetError(_('Budget bookmarks cannot carry filter params'))
            budget = Budget.objects.for_workspace(workspace_id).filter(id=data.budget_id).first()
            if not budget:
                raise BookmarkBudgetNotFoundError()
            enabled_codes = {currency.code for currency in CurrencyCatalogService.list_enabled(workspace_id)}
            if data.currency_code not in enabled_codes:
                raise BookmarkCurrencyNotEnabledError()
            return budget

        if data.budget_id is not None or data.currency_code is not None:
            raise BookmarkFilterTargetNotAllowedError()
        return None

    @staticmethod
    def get(user, workspace_id: int, bookmark_id: int) -> Bookmark:
        """Get one of the user's own bookmarks in the workspace (404 otherwise)."""
        bookmark = (
            Bookmark.objects.for_workspace(workspace_id)
            .select_related('budget')
            .filter(user=user, id=bookmark_id)
            .first()
        )
        if not bookmark:
            raise BookmarkNotFoundError()
        return bookmark

    @staticmethod
    def list(user, workspace_id: int) -> 'list[Bookmark]':
        # NOTE: the annotation is quoted - `list` is shadowed by the staticmethod
        # above inside this class body (categories/services.py precedent).
        """List the user's own bookmarks (archived included), in (position, id) order."""
        return list(
            Bookmark.objects.for_workspace(workspace_id)
            .filter(user=user)
            .select_related('budget')
            .order_by('position', 'id')
        )

    @staticmethod
    @db_transaction.atomic
    def create(user, workspace_id: int, data: BookmarkCreate) -> Bookmark:
        """Create a bookmark (target validated per kind, CI-unique name, next position).

        Budget bookmarks always store params == {} - the service-layer half of
        the coherence contract (the DB constraint covers only kind/budget/
        currency; JSONField equality against {} is not cleanly expressible
        there, per the task-1 model docstring).
        """
        budget = BookmarkService._validate_target(workspace_id, data)
        BookmarkService._check_ci_duplicate(user, workspace_id, data.name)

        return Bookmark.objects.create(
            workspace_id=workspace_id,
            user=user,
            kind=data.kind,
            name=data.name,
            icon=data.icon,
            color=data.color,
            position=BookmarkService._next_position(user, workspace_id),
            budget=budget,
            currency_code=data.currency_code,
            params=data.params if budget is None else {},
            created_by=user,
            updated_by=user,
        )

    @staticmethod
    @db_transaction.atomic
    def update(user, workspace_id: int, bookmark_id: int, data: BookmarkUpdate) -> Bookmark:
        """Full-replace the editable fields (name/icon/color).

        icon/color are direct assignments, so an omitted key stores the
        schema default (None) - it CLEARS the field; that is the documented
        full-replace behavior, pinned by test. Target fields (kind, budget,
        currency_code, params, position) are immutable after create - the
        update schema has no such fields, and recreating the bookmark is the
        documented way to change the target.
        """
        bookmark = BookmarkService.get(user, workspace_id, bookmark_id)

        if data.name.lower() != bookmark.name.lower():
            BookmarkService._check_ci_duplicate(user, workspace_id, data.name, exclude_id=bookmark_id)

        bookmark.name = data.name
        bookmark.icon = data.icon
        bookmark.color = data.color
        bookmark.updated_by = user
        bookmark.save()
        return bookmark

    @staticmethod
    @db_transaction.atomic
    def set_visibility(user, workspace_id: int, bookmark_id: int, data: BookmarkVisibility) -> Bookmark:
        """Partial update of the two visibility toggles (exclude_unset semantics).

        An omitted toggle is left unchanged - sending False is a real write,
        not an omission. The toggles are independent: archiving never touches
        is_active and vice versa.
        """
        bookmark = BookmarkService.get(user, workspace_id, bookmark_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(bookmark, field, value)
        bookmark.updated_by = user
        bookmark.save()
        return bookmark

    @staticmethod
    @db_transaction.atomic
    def move(user, workspace_id: int, bookmark_id: int, direction: str) -> Bookmark:
        """Swap the bookmark with its adjacent neighbor in the (position, id) ordering.

        That ordering is the FULL own-bookmark list (archived rows included) -
        the same ordering list() returns - so archived rows keep their
        relative place while rows reorder around them. Moving past either end
        is a documented no-op returning the bookmark unchanged (the manage
        page disables the boundary chevron; the server degrades gracefully).

        Both rows are locked in ascending id order (categories merge
        precedent) so concurrent moves over the same pair can never deadlock,
        and the post-lock len() check surfaces a concurrent delete as a
        domain 404 instead of a 500.
        """
        if direction not in ('up', 'down'):
            raise ValidationError(_('direction must be one of: up, down'))

        bookmark = BookmarkService.get(user, workspace_id, bookmark_id)

        own = Bookmark.objects.for_workspace(workspace_id).filter(user=user)
        if direction == 'up':
            neighbor = (
                own.filter(Q(position__lt=bookmark.position) | Q(position=bookmark.position, id__lt=bookmark.id))
                .order_by('-position', '-id')
                .first()
            )
        else:
            neighbor = (
                own.filter(Q(position__gt=bookmark.position) | Q(position=bookmark.position, id__gt=bookmark.id))
                .order_by('position', 'id')
                .first()
            )
        if neighbor is None:
            return bookmark

        # Serialize concurrent moves touching either row: lock both in id
        # order and re-verify both still exist (a concurrent request may have
        # deleted the neighbor while this one waited). Must materialize via
        # list(): .count() compiles to an aggregate query, from which Django
        # silently strips FOR UPDATE (Postgres forbids it), acquiring no
        # locks at all.
        locked = list(Bookmark.objects.select_for_update().filter(id__in=[bookmark.id, neighbor.id]).order_by('id'))
        if len(locked) != 2:
            raise BookmarkNotFoundError()
        locked_by_id = {row.id: row for row in locked}
        current = locked_by_id[bookmark.id]
        current_neighbor = locked_by_id[neighbor.id]

        if current.position != current_neighbor.position:
            current.position, current_neighbor.position = current_neighbor.position, current.position
        else:
            # Equal positions (sparse collision, e.g. two rows sharing the
            # default 0): a plain swap would be a no-op. Re-normalize the
            # pair so the post-move first row keeps the shared position and
            # the other lands right after it.
            if direction == 'up':
                current_neighbor.position = current.position + 1
            else:
                current.position = current_neighbor.position + 1

        for row in (current, current_neighbor):
            row.updated_by = user
            row.save(update_fields=['position', 'updated_by', 'updated_at'])
        return current

    @staticmethod
    @db_transaction.atomic
    def delete(user, workspace_id: int, bookmark_id: int) -> None:
        """Delete a bookmark. Positions stay sparse - nothing is renumbered."""
        bookmark = BookmarkService.get(user, workspace_id, bookmark_id)
        bookmark.delete()
