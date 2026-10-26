"""Service-level tests for the bookmarks app (API tests land with task 3)."""

from django.db import IntegrityError
from django.db import transaction as db_transaction
from django.test import TestCase
from pydantic import ValidationError as PydanticValidationError

from bookmarks.exceptions import (
    BookmarkBudgetNotFoundError,
    BookmarkBudgetTargetRequiredError,
    BookmarkCurrencyNotEnabledError,
    BookmarkDuplicateNameError,
    BookmarkFilterTargetNotAllowedError,
    BookmarkInvalidTargetError,
    BookmarkNotFoundError,
)
from bookmarks.factories import BookmarkFactory
from bookmarks.models import Bookmark
from bookmarks.schemas import BookmarkCreate, BookmarkMove, BookmarkOut, BookmarkUpdate, BookmarkVisibility
from bookmarks.services import BookmarkService
from budgeting.factories import BudgetCurrencyFactory, BudgetFactory
from common.exceptions import ValidationError
from common.tests.factories import UserFactory
from common.tests.mixins import APIClientMixin, AuthMixin
from currencies.services import CurrencyCatalogService
from workspaces.factories import WorkspaceFactory, WorkspaceMemberFactory


class BookmarkTestCase(AuthMixin, APIClientMixin, TestCase):
    """Base: workspace with PLN and USD enabled plus one budget."""

    def setUp(self):
        super().setUp()
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'PLN')
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'USD')
        self.budget = BudgetFactory(workspace=self.workspace, name='Main budget')

    def _create_data(self, **overrides) -> BookmarkCreate:
        payload = {
            'kind': 'budget',
            'name': 'Savings view',
            'budget_id': self.budget.id,
            'currency_code': 'PLN',
        }
        payload.update(overrides)
        return BookmarkCreate(**payload)


class TestCreateBookmark(BookmarkTestCase):
    def test_create_budget_bookmark(self):
        bookmark = BookmarkService.create(self.user, self.workspace.id, self._create_data())
        self.assertEqual(bookmark.kind, 'budget')
        self.assertEqual(bookmark.name, 'Savings view')
        self.assertEqual(bookmark.budget_id, self.budget.id)
        self.assertEqual(bookmark.currency_code, 'PLN')
        self.assertEqual(bookmark.params, {})
        self.assertEqual(bookmark.position, 0)
        self.assertTrue(bookmark.is_active)
        self.assertFalse(bookmark.is_archived)

    def test_create_filter_bookmark_stores_params_verbatim(self):
        data = self._create_data(
            kind='transactions', budget_id=None, currency_code=None, params={'account': '5', 'budget': '1,2'}
        )
        bookmark = BookmarkService.create(self.user, self.workspace.id, data)
        self.assertEqual(bookmark.kind, 'transactions')
        self.assertIsNone(bookmark.budget_id)
        self.assertIsNone(bookmark.currency_code)
        self.assertEqual(bookmark.params, {'account': '5', 'budget': '1,2'})

    def test_create_filter_bookmark_with_empty_params(self):
        # Empty params is a valid bookmark: a plain link to the page.
        data = self._create_data(kind='planned', budget_id=None, currency_code=None)
        bookmark = BookmarkService.create(self.user, self.workspace.id, data)
        self.assertEqual(bookmark.params, {})

    def test_create_appends_at_next_position(self):
        BookmarkService.create(self.user, self.workspace.id, self._create_data())
        second = BookmarkService.create(
            self.user, self.workspace.id, self._create_data(name='Second', currency_code='USD')
        )
        self.assertEqual(second.position, 1)

    def test_create_budget_kind_without_budget_rejected(self):
        with self.assertRaises(BookmarkBudgetTargetRequiredError):
            BookmarkService.create(self.user, self.workspace.id, self._create_data(budget_id=None))

    def test_create_budget_kind_without_currency_rejected(self):
        with self.assertRaises(BookmarkBudgetTargetRequiredError):
            BookmarkService.create(self.user, self.workspace.id, self._create_data(currency_code=None))

    def test_create_budget_kind_with_params_rejected(self):
        with self.assertRaises(BookmarkInvalidTargetError):
            BookmarkService.create(self.user, self.workspace.id, self._create_data(params={'account': '5'}))

    def test_create_filter_kind_with_budget_rejected(self):
        with self.assertRaises(BookmarkFilterTargetNotAllowedError):
            BookmarkService.create(
                self.user, self.workspace.id, self._create_data(kind='transactions', currency_code=None)
            )

    def test_create_filter_kind_with_currency_rejected(self):
        with self.assertRaises(BookmarkFilterTargetNotAllowedError):
            BookmarkService.create(self.user, self.workspace.id, self._create_data(kind='planned', budget_id=None))

    def test_create_budget_from_other_workspace_rejected(self):
        other_budget = BudgetFactory(name='Elsewhere')
        with self.assertRaises(BookmarkBudgetNotFoundError):
            BookmarkService.create(self.user, self.workspace.id, self._create_data(budget_id=other_budget.id))

    def test_create_currency_not_enabled_rejected(self):
        with self.assertRaises(BookmarkCurrencyNotEnabledError):
            BookmarkService.create(self.user, self.workspace.id, self._create_data(currency_code='EUR'))

    def test_create_currency_loose_against_budget_own_set(self):
        # PLN is enabled in the workspace but not part of the budget's own
        # currency set: the check is deliberately loose (design contract) so
        # stale bookmarks degrade on the page instead of failing at save.
        usd = CurrencyCatalogService.get_enabled(self.workspace.id, 'USD')
        BudgetCurrencyFactory(budget=self.budget, currency=usd)
        bookmark = BookmarkService.create(self.user, self.workspace.id, self._create_data(currency_code='PLN'))
        self.assertEqual(bookmark.currency_code, 'PLN')

    def test_create_allows_inactive_budget(self):
        # An archived budget's bookmark still opens - inactive stays bookmarkable.
        inactive = BudgetFactory(workspace=self.workspace, is_active=False)
        bookmark = BookmarkService.create(
            self.user, self.workspace.id, self._create_data(budget_id=inactive.id, name='Old plan')
        )
        self.assertEqual(bookmark.budget_id, inactive.id)

    def test_create_duplicate_name_case_insensitive_rejected(self):
        BookmarkService.create(self.user, self.workspace.id, self._create_data())
        with self.assertRaises(BookmarkDuplicateNameError):
            BookmarkService.create(self.user, self.workspace.id, self._create_data(name='SAVINGS VIEW'))

    def test_create_same_name_for_other_user_allowed(self):
        BookmarkService.create(self.user, self.workspace.id, self._create_data())
        other = UserFactory()
        WorkspaceMemberFactory(workspace=self.workspace, user=other, role='member')
        bookmark = BookmarkService.create(other, self.workspace.id, self._create_data())
        self.assertEqual(bookmark.name, 'Savings view')

    def test_create_same_name_in_other_workspace_allowed(self):
        BookmarkService.create(self.user, self.workspace.id, self._create_data())
        other_workspace = WorkspaceFactory(name='Other')
        other_budget = BudgetFactory(workspace=other_workspace)
        # The bookmark's currency must be enabled in the TARGET workspace -
        # the setUp enablements belong to self.workspace only.
        CurrencyCatalogService.enable(self.user, other_workspace.id, 'PLN')
        bookmark = BookmarkService.create(self.user, other_workspace.id, self._create_data(budget_id=other_budget.id))
        self.assertEqual(bookmark.workspace_id, other_workspace.id)


class TestCreateSchemaValidation(TestCase):
    """Schema-level pins: patterns and caps reject before any service logic runs."""

    def _payload(self, **overrides):
        payload = {'kind': 'transactions', 'name': 'Filters'}
        payload.update(overrides)
        return payload

    def test_name_is_trimmed(self):
        self.assertEqual(BookmarkCreate(**self._payload(name='  Rent view  ')).name, 'Rent view')

    def test_name_whitespace_only_rejected(self):
        with self.assertRaises(PydanticValidationError):
            BookmarkCreate(**self._payload(name='   '))

    def test_name_longer_than_100_rejected(self):
        with self.assertRaises(PydanticValidationError):
            BookmarkCreate(**self._payload(name='x' * 101))

    def test_icon_must_be_kebab_key(self):
        self.assertEqual(BookmarkCreate(**self._payload(icon='heart-pulse')).icon, 'heart-pulse')
        for bad in ('Home Icon', 'icon_1', ''):
            with self.assertRaises(PydanticValidationError):
                BookmarkCreate(**self._payload(icon=bad))

    def test_color_must_be_swatch_key_not_hex(self):
        # A swatch KEY by construction: lowercase letter first, then letters,
        # digits, hyphens - a hex value can never match the pattern.
        self.assertEqual(BookmarkCreate(**self._payload(color='negative')).color, 'negative')
        for bad in ('#FF5733', '2neutral', '-red', ''):
            with self.assertRaises(PydanticValidationError):
                BookmarkCreate(**self._payload(color=bad))

    def test_currency_code_pattern(self):
        with self.assertRaises(PydanticValidationError):
            BookmarkCreate(**self._payload(currency_code='pln'))
        self.assertEqual(BookmarkCreate(**self._payload(currency_code='PLN')).currency_code, 'PLN')

    def test_kind_allowlist(self):
        with self.assertRaises(PydanticValidationError):
            BookmarkCreate(**self._payload(kind='dashboard'))

    def test_params_value_length_cap(self):
        with self.assertRaises(PydanticValidationError):
            BookmarkCreate(**self._payload(params={'account': 'x' * 501}))

    def test_params_entry_cap(self):
        params = {f'key{index}': str(index) for index in range(21)}
        with self.assertRaises(PydanticValidationError):
            BookmarkCreate(**self._payload(params=params))

    def test_params_total_serialized_length_cap(self):
        # 10 entries of 500-char values: each value passes its own cap and the
        # entry count is under 20 - only the total cap can fire.
        params = {f'k{index}': 'x' * 500 for index in range(10)}
        with self.assertRaises(PydanticValidationError):
            BookmarkCreate(**self._payload(params=params))

    def test_move_direction_allowlist(self):
        self.assertEqual(BookmarkMove(direction='up').direction, 'up')
        with self.assertRaises(PydanticValidationError):
            BookmarkMove(direction='sideways')


class TestUpdateBookmark(BookmarkTestCase):
    def setUp(self):
        super().setUp()
        self.bookmark = BookmarkService.create(
            self.user, self.workspace.id, self._create_data(icon='wallet', color='positive')
        )

    def _update_data(self, **overrides) -> BookmarkUpdate:
        payload = {'name': 'Savings view'}
        payload.update(overrides)
        return BookmarkUpdate(**payload)

    def test_update_renames(self):
        bookmark = BookmarkService.update(
            self.user, self.workspace.id, self.bookmark.id, self._update_data(name='Renamed')
        )
        self.assertEqual(bookmark.name, 'Renamed')

    def test_update_full_replace_clears_icon_and_color(self):
        # Full-replace semantics: an omitted icon/color stores the schema
        # default (None), i.e. it CLEARS the field.
        bookmark = BookmarkService.update(self.user, self.workspace.id, self.bookmark.id, self._update_data())
        self.assertIsNone(bookmark.icon)
        self.assertIsNone(bookmark.color)

    def test_update_replaces_icon_and_color(self):
        bookmark = BookmarkService.update(
            self.user, self.workspace.id, self.bookmark.id, self._update_data(icon='piggy-bank', color='violet')
        )
        self.assertEqual(bookmark.icon, 'piggy-bank')
        self.assertEqual(bookmark.color, 'violet')

    def test_update_same_name_new_casing_allowed(self):
        # CI-equal to itself: the duplicate check is skipped and the new
        # casing is stored.
        bookmark = BookmarkService.update(
            self.user, self.workspace.id, self.bookmark.id, self._update_data(name='SAVINGS VIEW')
        )
        self.assertEqual(bookmark.name, 'SAVINGS VIEW')

    def test_update_duplicate_name_rejected(self):
        BookmarkService.create(self.user, self.workspace.id, self._create_data(name='Other view', currency_code='USD'))
        with self.assertRaises(BookmarkDuplicateNameError):
            BookmarkService.update(self.user, self.workspace.id, self.bookmark.id, self._update_data(name='other view'))

    def test_update_schema_has_no_target_fields(self):
        self.assertEqual(set(BookmarkUpdate.model_fields), {'name', 'icon', 'color'})

    def test_update_ignores_target_keys_and_keeps_target_immutable(self):
        # Pydantic's default extra='ignore' drops unknown keys: the target
        # cannot be changed through update even by a hand-built payload.
        bookmark = BookmarkService.update(
            self.user,
            self.workspace.id,
            self.bookmark.id,
            BookmarkUpdate(
                **{
                    'name': 'Savings view',
                    'kind': 'transactions',
                    'budget_id': None,
                    'currency_code': None,
                    'params': {'account': '5'},
                    'position': 99,
                }
            ),
        )
        self.assertEqual(bookmark.kind, 'budget')
        self.assertEqual(bookmark.budget_id, self.budget.id)
        self.assertEqual(bookmark.currency_code, 'PLN')
        self.assertEqual(bookmark.params, {})
        self.assertEqual(bookmark.position, 0)

    def test_update_other_users_bookmark_rejected(self):
        other = UserFactory()
        WorkspaceMemberFactory(workspace=self.workspace, user=other, role='member')
        with self.assertRaises(BookmarkNotFoundError):
            BookmarkService.update(other, self.workspace.id, self.bookmark.id, self._update_data())

    def test_update_other_workspace_rejected(self):
        elsewhere = WorkspaceFactory(name='Elsewhere')
        with self.assertRaises(BookmarkNotFoundError):
            BookmarkService.update(self.user, elsewhere.id, self.bookmark.id, self._update_data())


class TestSetVisibility(BookmarkTestCase):
    def setUp(self):
        super().setUp()
        self.bookmark = BookmarkService.create(self.user, self.workspace.id, self._create_data())

    def test_set_active_only_leaves_archived_unchanged(self):
        bookmark = BookmarkService.set_visibility(
            self.user, self.workspace.id, self.bookmark.id, BookmarkVisibility(is_active=False)
        )
        self.assertFalse(bookmark.is_active)
        self.assertFalse(bookmark.is_archived)

    def test_set_archived_only_leaves_active_unchanged(self):
        bookmark = BookmarkService.set_visibility(
            self.user, self.workspace.id, self.bookmark.id, BookmarkVisibility(is_archived=True)
        )
        self.assertTrue(bookmark.is_archived)
        self.assertTrue(bookmark.is_active)

    def test_set_both_toggles(self):
        bookmark = BookmarkService.set_visibility(
            self.user, self.workspace.id, self.bookmark.id, BookmarkVisibility(is_active=False, is_archived=True)
        )
        self.assertFalse(bookmark.is_active)
        self.assertTrue(bookmark.is_archived)

    def test_neither_toggle_sent_is_noop(self):
        bookmark = BookmarkService.set_visibility(self.user, self.workspace.id, self.bookmark.id, BookmarkVisibility())
        self.assertTrue(bookmark.is_active)
        self.assertFalse(bookmark.is_archived)

    def test_other_user_rejected(self):
        other = UserFactory()
        with self.assertRaises(BookmarkNotFoundError):
            BookmarkService.set_visibility(
                other, self.workspace.id, self.bookmark.id, BookmarkVisibility(is_archived=True)
            )


class TestMoveBookmark(BookmarkTestCase):
    def setUp(self):
        super().setUp()
        self.first = self._row(position=0, name='First')
        self.middle = self._row(position=1, name='Middle')
        self.last = self._row(position=2, name='Last')

    def _row(self, position: int, name: str) -> Bookmark:
        return BookmarkFactory(
            user=self.user,
            workspace=self.workspace,
            budget=self.budget,
            currency_code='PLN',
            position=position,
            name=name,
        )

    def _ordered_ids(self) -> list[int]:
        return [bookmark.id for bookmark in BookmarkService.list(self.user, self.workspace.id)]

    def test_move_down_swaps_with_next(self):
        BookmarkService.move(self.user, self.workspace.id, self.middle.id, 'down')
        self.assertEqual(self._ordered_ids(), [self.first.id, self.last.id, self.middle.id])

    def test_move_up_swaps_with_previous(self):
        BookmarkService.move(self.user, self.workspace.id, self.last.id, 'up')
        self.assertEqual(self._ordered_ids(), [self.first.id, self.last.id, self.middle.id])

    def test_move_up_at_first_boundary_is_noop(self):
        BookmarkService.move(self.user, self.workspace.id, self.first.id, 'up')
        self.assertEqual(self._ordered_ids(), [self.first.id, self.middle.id, self.last.id])
        self.first.refresh_from_db()
        self.assertEqual(self.first.position, 0)

    def test_move_down_at_last_boundary_is_noop(self):
        BookmarkService.move(self.user, self.workspace.id, self.last.id, 'down')
        self.assertEqual(self._ordered_ids(), [self.first.id, self.middle.id, self.last.id])

    def test_move_leaves_other_rows_untouched(self):
        BookmarkService.move(self.user, self.workspace.id, self.middle.id, 'down')
        self.first.refresh_from_db()
        self.assertEqual(self.first.position, 0)

    def test_move_with_equal_positions_renormalizes_pair(self):
        # Two rows sharing the sparse default 0: order falls to id, and a move
        # must not no-op - the pair is re-normalized so the moved row comes
        # first. Both rows are a second user's so the pair is isolated (this
        # class's setUp rows would otherwise sit between them in the shared
        # (position, id) ordering).
        other = UserFactory()
        WorkspaceMemberFactory(workspace=self.workspace, user=other, role='member')
        low = BookmarkFactory(
            user=other, workspace=self.workspace, budget=self.budget, currency_code='PLN', position=0, name='Low id'
        )
        high = BookmarkFactory(
            user=other, workspace=self.workspace, budget=self.budget, currency_code='PLN', position=0, name='High id'
        )
        # low.id < high.id (creation order): initial (position, id) order is low, high.

        # Moving high up re-normalizes: high (the post-move first row) keeps
        # the shared position, low lands right after it.
        BookmarkService.move(other, self.workspace.id, high.id, 'up')
        low.refresh_from_db()
        high.refresh_from_db()
        self.assertEqual((high.position, low.position), (0, 1))

        # Reset the collision, then move low down: high (the post-move first
        # row) keeps the shared position, low lands right after it - the
        # down-direction mirror of the branch above.
        Bookmark.objects.filter(id__in=[low.id, high.id]).update(position=0)
        BookmarkService.move(other, self.workspace.id, low.id, 'down')
        low.refresh_from_db()
        high.refresh_from_db()
        self.assertEqual((low.position, high.position), (1, 0))

    def test_move_neighbor_lookup_uses_position_then_id(self):
        # A tie row shares position 0 with `first`: its up-neighbor is the
        # smaller-id row, not the position-1 row.
        tie = self._row(position=0, name='Tie')
        BookmarkService.move(self.user, self.workspace.id, tie.id, 'up')
        self.assertEqual(self._ordered_ids()[:2], [tie.id, self.first.id])

    def test_move_swaps_with_archived_neighbor(self):
        # The ordering move operates in is the FULL own list - archived rows
        # participate, keeping their relative place while rows reorder around
        # them (pinned design decision).
        BookmarkService.set_visibility(
            self.user, self.workspace.id, self.middle.id, BookmarkVisibility(is_archived=True)
        )
        BookmarkService.move(self.user, self.workspace.id, self.last.id, 'up')
        self.assertEqual(self._ordered_ids(), [self.first.id, self.last.id, self.middle.id])

    def test_move_other_user_rejected(self):
        other = UserFactory()
        with self.assertRaises(BookmarkNotFoundError):
            BookmarkService.move(other, self.workspace.id, self.middle.id, 'up')

    def test_move_rejects_unknown_direction(self):
        with self.assertRaises(ValidationError):
            BookmarkService.move(self.user, self.workspace.id, self.middle.id, 'sideways')


class TestDeleteBookmark(BookmarkTestCase):
    def setUp(self):
        super().setUp()
        self.first = self._row(position=0, name='First')
        self.middle = self._row(position=1, name='Middle')
        self.last = self._row(position=2, name='Last')

    def _row(self, position: int, name: str) -> Bookmark:
        return BookmarkFactory(
            user=self.user,
            workspace=self.workspace,
            budget=self.budget,
            currency_code='PLN',
            position=position,
            name=name,
        )

    def test_delete_own_bookmark(self):
        BookmarkService.delete(self.user, self.workspace.id, self.middle.id)
        self.assertEqual(Bookmark.objects.count(), 2)

    def test_delete_other_users_bookmark_rejected(self):
        other = UserFactory()
        with self.assertRaises(BookmarkNotFoundError):
            BookmarkService.delete(other, self.workspace.id, self.middle.id)
        self.assertTrue(Bookmark.objects.filter(id=self.middle.id).exists())

    def test_delete_keeps_positions_sparse(self):
        BookmarkService.delete(self.user, self.workspace.id, self.middle.id)
        self.first.refresh_from_db()
        self.last.refresh_from_db()
        self.assertEqual((self.first.position, self.last.position), (0, 2))


class TestListBookmarks(BookmarkTestCase):
    def _row(self, position: int, name: str) -> Bookmark:
        return BookmarkFactory(
            user=self.user,
            workspace=self.workspace,
            budget=self.budget,
            currency_code='PLN',
            position=position,
            name=name,
        )

    def test_list_returns_own_rows_only(self):
        other = UserFactory()
        WorkspaceMemberFactory(workspace=self.workspace, user=other, role='member')
        mine = BookmarkService.create(self.user, self.workspace.id, self._create_data())
        BookmarkFactory(user=other, workspace=self.workspace, budget=self.budget, currency_code='PLN', name='Theirs')

        result = BookmarkService.list(self.user, self.workspace.id)
        self.assertEqual([bookmark.id for bookmark in result], [mine.id])

    def test_list_excludes_other_workspaces(self):
        mine = BookmarkService.create(self.user, self.workspace.id, self._create_data())
        other_workspace = WorkspaceFactory(name='Elsewhere')
        other_budget = BudgetFactory(workspace=other_workspace)
        BookmarkFactory(
            user=self.user, workspace=other_workspace, budget=other_budget, currency_code='USD', name='Other workspace'
        )

        result = BookmarkService.list(self.user, self.workspace.id)
        self.assertEqual([bookmark.id for bookmark in result], [mine.id])

    def test_list_includes_archived(self):
        bookmark = BookmarkService.create(self.user, self.workspace.id, self._create_data())
        BookmarkService.set_visibility(self.user, self.workspace.id, bookmark.id, BookmarkVisibility(is_archived=True))
        self.assertEqual(len(BookmarkService.list(self.user, self.workspace.id)), 1)

    def test_list_orders_by_position_then_id(self):
        first_tie = self._row(position=0, name='First tie')
        second_tie = self._row(position=0, name='Second tie')
        tail = self._row(position=5, name='Tail')

        result = BookmarkService.list(self.user, self.workspace.id)
        self.assertEqual([bookmark.id for bookmark in result], [first_tie.id, second_tie.id, tail.id])


class TestBookmarkOut(BookmarkTestCase):
    def test_out_serializes_budget_bookmark(self):
        bookmark = BookmarkService.create(self.user, self.workspace.id, self._create_data())
        out = BookmarkOut.model_validate(bookmark)
        self.assertEqual(out.budget_name, 'Main budget')
        self.assertEqual(out.budget_id, self.budget.id)
        self.assertEqual(out.kind, 'budget')
        self.assertEqual(out.currency_code, 'PLN')
        self.assertEqual(out.params, {})
        self.assertIsNone(out.icon)

    def test_out_serializes_filter_bookmark_without_target(self):
        bookmark = BookmarkService.create(
            self.user,
            self.workspace.id,
            self._create_data(kind='transactions', budget_id=None, currency_code=None, params={'account': '5'}),
        )
        out = BookmarkOut.model_validate(bookmark)
        self.assertIsNone(out.budget_name)
        self.assertIsNone(out.budget_id)
        self.assertIsNone(out.currency_code)
        self.assertEqual(out.params, {'account': '5'})


class TestDbConstraints(BookmarkTestCase):
    """Direct constraint pins - the service and (task 3) API reject earlier,
    so these reach the DB on purpose (savepoint-isolated per skill)."""

    def test_ci_name_constraint(self):
        BookmarkFactory(user=self.user, workspace=self.workspace, budget=self.budget, currency_code='PLN', name='Food')
        with self.assertRaises(IntegrityError):
            with db_transaction.atomic():  # SAVEPOINT - isolates the rollback
                BookmarkFactory(
                    user=self.user, workspace=self.workspace, budget=self.budget, currency_code='USD', name='food'
                )
        self.assertEqual(Bookmark.objects.count(), 1)

    def test_budget_kind_requires_target_constraints(self):
        # The override is merged into a kwargs dict BEFORE the call - passing
        # it both positionally in the literal and via **overrides would be a
        # duplicate-keyword TypeError.
        for overrides in ({'budget': None}, {'currency_code': None}):
            kwargs = {
                'user': self.user,
                'workspace': self.workspace,
                'budget': self.budget,
                'currency_code': 'PLN',
                'name': f'Bad {overrides}',
                **overrides,
            }
            with self.assertRaises(IntegrityError):
                with db_transaction.atomic():
                    BookmarkFactory(**kwargs)
        self.assertEqual(Bookmark.objects.count(), 0)

    def test_filter_kind_targetless_constraint(self):
        # kwargs dict first - see test_budget_kind_requires_target_constraints.
        for overrides in ({'budget': self.budget}, {'currency_code': 'PLN'}):
            kwargs = {
                'user': self.user,
                'workspace': self.workspace,
                'budget': None,
                'currency_code': None,
                'kind': 'transactions',
                'name': f'Bad {overrides}',
                **overrides,
            }
            with self.assertRaises(IntegrityError):
                with db_transaction.atomic():
                    BookmarkFactory(**kwargs)
        self.assertEqual(Bookmark.objects.count(), 0)


# =============================================================================
# API endpoint tests (task 3) - service tests above must stay untouched
# =============================================================================


class BookmarkAPITestCase(AuthMixin, APIClientMixin, TestCase):
    """Shared fixtures for the bookmark endpoint tests.

    USD is enabled (budget-kind creates validate the currency against the
    workspace's enabled set, loosely - the budget itself needs no USD row).
    Bookmarks under test are created through the API so positions come from
    the service's next-position helper, exactly like real traffic.
    """

    def setUp(self):
        super().setUp()
        CurrencyCatalogService.enable(self.user, self.workspace.id, 'USD')
        self.budget = BudgetFactory(workspace=self.workspace, name='Main budget')

    def _budget_payload(self, name, **overrides):
        payload = {
            'kind': 'budget',
            'name': name,
            'icon': 'wallet',
            'color': 'blue',
            'budget_id': self.budget.id,
            'currency_code': 'USD',
        }
        payload.update(overrides)
        return payload

    def _member_in_workspace(self, role='member'):
        """A second user in the SAME workspace, for cross-user isolation probes."""
        other = UserFactory(email='other@example.com', current_workspace=self.workspace)
        WorkspaceMemberFactory(workspace=self.workspace, user=other, role=role)
        return other


class TestBookmarkListAPI(BookmarkAPITestCase):
    """GET /api/bookmarks - all of the current user's bookmarks, ordered (position, id)."""

    def test_empty_list_for_fresh_user(self):
        data = self.get('/api/bookmarks', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data, [])

    def test_returns_own_bookmarks_in_position_order_including_archived(self):
        self.post('/api/bookmarks', self._budget_payload('Groceries view'), **self.auth_headers())
        self.assertStatus(201)
        second = self.post('/api/bookmarks', {'kind': 'transactions', 'name': 'Txns'}, **self.auth_headers())
        self.assertStatus(201)
        self.post('/api/bookmarks', {'kind': 'planned', 'name': 'Planned'}, **self.auth_headers())
        self.assertStatus(201)
        Bookmark.objects.filter(id=second['id']).update(is_archived=True)

        data = self.get('/api/bookmarks', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual([b['name'] for b in data], ['Groceries view', 'Txns', 'Planned'])
        # Archived rows ride along (the manage page lists them).
        self.assertTrue(next(b for b in data if b['id'] == second['id'])['is_archived'])

    def test_excludes_other_users_bookmarks(self):
        other = self._member_in_workspace()
        BookmarkFactory(user=other, budget=self.budget, workspace=self.workspace, name='Theirs')
        self.post('/api/bookmarks', self._budget_payload('Mine'), **self.auth_headers())
        self.assertStatus(201)

        data = self.get('/api/bookmarks', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual([b['name'] for b in data], ['Mine'])

    def test_excludes_other_workspace_bookmarks(self):
        other_workspace = WorkspaceFactory()
        BookmarkFactory(
            user=self.user,
            budget=BudgetFactory(workspace=other_workspace),
            workspace=other_workspace,
            name='Other workspace view',
        )

        data = self.get('/api/bookmarks', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data, [])


class TestCreateBookmarkAPI(BookmarkAPITestCase):
    """POST /api/bookmarks - 201 BookmarkOut | 400 (service validation) | 404 (resource reference) | 422 (schema)."""

    def test_create_budget_bookmark_full_body_shape(self):
        data = self.post('/api/bookmarks', self._budget_payload('Groceries view'), **self.auth_headers())
        self.assertStatus(201)
        # Field set derives from the landed BookmarkOut (task 2), which has
        # no timestamp fields - the spec text listed created_at/updated_at
        # the schema never defined.
        self.assertEqual(
            set(data),
            {
                'id',
                'kind',
                'name',
                'icon',
                'color',
                'position',
                'is_active',
                'is_archived',
                'budget_id',
                'budget_name',
                'currency_code',
                'params',
            },
        )
        self.assertEqual(data['kind'], 'budget')
        self.assertEqual(data['name'], 'Groceries view')
        self.assertEqual(data['icon'], 'wallet')
        self.assertEqual(data['color'], 'blue')
        self.assertTrue(data['is_active'])
        self.assertFalse(data['is_archived'])
        self.assertEqual(data['budget_id'], self.budget.id)
        self.assertEqual(data['budget_name'], 'Main budget')
        self.assertEqual(data['currency_code'], 'USD')
        self.assertEqual(data['params'], {})

    def test_create_filter_bookmark_with_params(self):
        data = self.post(
            '/api/bookmarks',
            {'kind': 'transactions', 'name': 'Big spends', 'params': {'account': '12', 'min_amount': '50'}},
            **self.auth_headers(),
        )
        self.assertStatus(201)
        self.assertIsNone(data['budget_id'])
        self.assertIsNone(data['budget_name'])
        self.assertIsNone(data['currency_code'])
        self.assertEqual(data['params'], {'account': '12', 'min_amount': '50'})

    def test_create_filter_bookmark_with_empty_params(self):
        data = self.post('/api/bookmarks', {'kind': 'planned', 'name': 'All planned'}, **self.auth_headers())
        self.assertStatus(201)
        self.assertEqual(data['params'], {})

    def test_duplicate_name_case_insensitive_returns_400(self):
        self.post('/api/bookmarks', self._budget_payload('Groceries view'), **self.auth_headers())
        self.assertStatus(201)
        detail = self.post('/api/bookmarks', self._budget_payload('groceries VIEW'), **self.auth_headers())
        self.assertStatus(400)
        self.assertEqual(detail['code'], 'duplicate_name')

    def test_same_name_across_users_ok(self):
        other = self._member_in_workspace()
        BookmarkFactory(user=other, budget=self.budget, workspace=self.workspace, name='Shared name')
        self.post('/api/bookmarks', self._budget_payload('Shared name'), **self.auth_headers())
        self.assertStatus(201)

    def test_budget_from_other_workspace_returns_404(self):
        # Task-1 amended contract: the budget FK is a resource reference, so
        # BookmarkBudgetNotFoundError extends NotFoundError - wire code 404.
        foreign_budget = BudgetFactory(workspace=WorkspaceFactory())
        detail = self.post(
            '/api/bookmarks',
            self._budget_payload('Foreign view', budget_id=foreign_budget.id),
            **self.auth_headers(),
        )
        self.assertStatus(404)
        self.assertEqual(detail['code'], 'budget_not_found')
        self.assertEqual(Bookmark.objects.count(), 0)

    def test_currency_not_enabled_returns_404(self):
        detail = self.post(
            '/api/bookmarks',
            self._budget_payload('EUR view', currency_code='EUR'),
            **self.auth_headers(),
        )
        self.assertStatus(404)
        self.assertEqual(detail['code'], 'currency_not_enabled')

    def test_budget_kind_without_budget_and_currency_returns_400(self):
        self.post(
            '/api/bookmarks',
            self._budget_payload('No target', budget_id=None, currency_code=None),
            **self.auth_headers(),
        )
        self.assertStatus(400)
        self.assertEqual(Bookmark.objects.count(), 0)

    def test_filter_kind_with_budget_returns_400(self):
        detail = self.post(
            '/api/bookmarks',
            {'kind': 'transactions', 'name': 'Weird', 'budget_id': self.budget.id, 'currency_code': 'USD'},
            **self.auth_headers(),
        )
        self.assertStatus(400)
        self.assertEqual(detail['code'], 'filter_target_not_allowed')

    def test_name_too_long_returns_422(self):
        self.post('/api/bookmarks', self._budget_payload('x' * 101), **self.auth_headers())
        self.assertStatus(422)

    def test_unknown_kind_returns_422(self):
        # Schema-level kind restriction (task-2 schema).
        self.post('/api/bookmarks', self._budget_payload('Bad kind', kind='unknown'), **self.auth_headers())
        self.assertStatus(422)


class TestUpdateBookmarkAPI(BookmarkAPITestCase):
    """PUT /api/bookmarks/{id} - full-replace of name/icon/color only (target immutable)."""

    def setUp(self):
        super().setUp()
        created = self.post('/api/bookmarks', self._budget_payload('Old name'), **self.auth_headers())
        self.assertStatus(201)
        self.bookmark_id = created['id']

    def _update_payload(self, **overrides):
        payload = {'name': 'New name', 'icon': 'cart', 'color': 'violet'}
        payload.update(overrides)
        return payload

    def test_rename_and_restyle(self):
        data = self.put(f'/api/bookmarks/{self.bookmark_id}', self._update_payload(), **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['name'], 'New name')
        self.assertEqual(data['icon'], 'cart')
        self.assertEqual(data['color'], 'violet')
        # Target untouched by a presentation-only edit.
        self.assertEqual(data['kind'], 'budget')
        self.assertEqual(data['budget_id'], self.budget.id)
        self.assertEqual(data['currency_code'], 'USD')

    def test_extra_fields_are_ignored_target_stays_immutable(self):
        # The schema accepts only name/icon/color; kind/budget/currency/params
        # in the body are dropped (extra='ignore'), never applied.
        data = self.put(
            f'/api/bookmarks/{self.bookmark_id}',
            self._update_payload(kind='transactions', budget_id=None, currency_code=None, params={'account': '1'}),
            **self.auth_headers(),
        )
        self.assertStatus(200)
        self.assertEqual(data['kind'], 'budget')
        self.assertEqual(data['budget_id'], self.budget.id)
        self.assertEqual(data['currency_code'], 'USD')
        self.assertEqual(data['params'], {})

    def test_duplicate_name_returns_400(self):
        self.post('/api/bookmarks', self._budget_payload('Taken'), **self.auth_headers())
        self.assertStatus(201)
        detail = self.put(
            f'/api/bookmarks/{self.bookmark_id}', self._update_payload(name='taken'), **self.auth_headers()
        )
        self.assertStatus(400)
        self.assertEqual(detail['code'], 'duplicate_name')

    def test_other_users_bookmark_returns_404(self):
        other = self._member_in_workspace()
        foreign = BookmarkFactory(user=other, budget=self.budget, workspace=self.workspace, name='Theirs')
        self.put(f'/api/bookmarks/{foreign.id}', self._update_payload(), **self.auth_headers())
        self.assertStatus(404)

    def test_unknown_id_returns_404(self):
        self.put('/api/bookmarks/999999', self._update_payload(), **self.auth_headers())
        self.assertStatus(404)


class TestBookmarkVisibilityAPI(BookmarkAPITestCase):
    """PATCH /api/bookmarks/{id}/visibility - partial is_active / is_archived."""

    def setUp(self):
        super().setUp()
        created = self.post('/api/bookmarks', self._budget_payload('Toggle me'), **self.auth_headers())
        self.assertStatus(201)
        self.bookmark_id = created['id']

    def test_deactivate(self):
        data = self.patch(f'/api/bookmarks/{self.bookmark_id}/visibility', {'is_active': False}, **self.auth_headers())
        self.assertStatus(200)
        self.assertFalse(data['is_active'])
        self.assertFalse(data['is_archived'])

    def test_archive_then_restore(self):
        data = self.patch(f'/api/bookmarks/{self.bookmark_id}/visibility', {'is_archived': True}, **self.auth_headers())
        self.assertStatus(200)
        self.assertTrue(data['is_archived'])
        self.assertTrue(data['is_active'])
        data = self.patch(
            f'/api/bookmarks/{self.bookmark_id}/visibility', {'is_archived': False}, **self.auth_headers()
        )
        self.assertStatus(200)
        self.assertFalse(data['is_archived'])

    def test_both_flags_in_one_request(self):
        data = self.patch(
            f'/api/bookmarks/{self.bookmark_id}/visibility',
            {'is_active': False, 'is_archived': True},
            **self.auth_headers(),
        )
        self.assertStatus(200)
        self.assertFalse(data['is_active'])
        self.assertTrue(data['is_archived'])

    def test_empty_body_is_a_no_op(self):
        data = self.patch(f'/api/bookmarks/{self.bookmark_id}/visibility', {}, **self.auth_headers())
        self.assertStatus(200)
        self.assertTrue(data['is_active'])
        self.assertFalse(data['is_archived'])

    def test_unknown_id_returns_404(self):
        self.patch('/api/bookmarks/999999/visibility', {'is_active': False}, **self.auth_headers())
        self.assertStatus(404)


class TestMoveBookmarkAPI(BookmarkAPITestCase):
    """POST /api/bookmarks/{id}/move - atomic neighbor swap."""

    def setUp(self):
        super().setUp()
        for name in ('Alpha', 'Beta', 'Gamma'):
            self.post('/api/bookmarks', self._budget_payload(name), **self.auth_headers())
            self.assertStatus(201)
        data = self.get('/api/bookmarks', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual([b['name'] for b in data], ['Alpha', 'Beta', 'Gamma'])
        self.ids = [b['id'] for b in data]

    def _names(self):
        return [b['name'] for b in self.get('/api/bookmarks', **self.auth_headers())]

    def test_move_up_swaps_with_predecessor(self):
        data = self.post(f'/api/bookmarks/{self.ids[1]}/move', {'direction': 'up'}, **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['name'], 'Beta')
        self.assertEqual(self._names(), ['Beta', 'Alpha', 'Gamma'])

    def test_move_down_swaps_with_successor(self):
        self.post(f'/api/bookmarks/{self.ids[1]}/move', {'direction': 'down'}, **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(self._names(), ['Alpha', 'Gamma', 'Beta'])

    def test_move_at_boundary_is_a_no_op(self):
        # First row moved up stays first (no neighbor to swap with).
        data = self.post(f'/api/bookmarks/{self.ids[0]}/move', {'direction': 'up'}, **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['name'], 'Alpha')
        self.assertEqual(self._names(), ['Alpha', 'Beta', 'Gamma'])

    def test_invalid_direction_returns_422(self):
        self.post(f'/api/bookmarks/{self.ids[0]}/move', {'direction': 'sideways'}, **self.auth_headers())
        self.assertStatus(422)

    def test_other_users_bookmark_returns_404(self):
        other = self._member_in_workspace()
        foreign = BookmarkFactory(user=other, budget=self.budget, workspace=self.workspace, name='Theirs')
        self.post(f'/api/bookmarks/{foreign.id}/move', {'direction': 'up'}, **self.auth_headers())
        self.assertStatus(404)


class TestDeleteBookmarkAPI(BookmarkAPITestCase):
    """DELETE /api/bookmarks/{id} - 204 | 404."""

    def test_delete(self):
        created = self.post('/api/bookmarks', self._budget_payload('Delete me'), **self.auth_headers())
        self.assertStatus(201)
        self.delete(f'/api/bookmarks/{created["id"]}', **self.auth_headers())
        self.assertStatus(204)
        self.assertEqual(Bookmark.objects.count(), 0)

    def test_delete_twice_returns_404(self):
        created = self.post('/api/bookmarks', self._budget_payload('Delete me'), **self.auth_headers())
        self.assertStatus(201)
        self.delete(f'/api/bookmarks/{created["id"]}', **self.auth_headers())
        self.assertStatus(204)
        self.delete(f'/api/bookmarks/{created["id"]}', **self.auth_headers())
        self.assertStatus(404)

    def test_other_users_bookmark_returns_404(self):
        other = self._member_in_workspace()
        foreign = BookmarkFactory(user=other, budget=self.budget, workspace=self.workspace, name='Theirs')
        self.delete(f'/api/bookmarks/{foreign.id}', **self.auth_headers())
        self.assertStatus(404)
        self.assertTrue(Bookmark.objects.filter(id=foreign.id).exists())


class TestBookmarkViewerRoleAPI(BookmarkAPITestCase):
    """Bookmarks are personal: viewers have full CRUD on their own rows (no require_role)."""

    user_role = 'viewer'

    def test_viewer_full_lifecycle(self):
        data = self.post('/api/bookmarks', self._budget_payload('Viewer view'), **self.auth_headers())
        self.assertStatus(201)
        bookmark_id = data['id']

        data = self.get('/api/bookmarks', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual([b['name'] for b in data], ['Viewer view'])

        data = self.put(
            f'/api/bookmarks/{bookmark_id}',
            {'name': 'Renamed', 'icon': 'home', 'color': 'teal'},
            **self.auth_headers(),
        )
        self.assertStatus(200)
        self.assertEqual(data['name'], 'Renamed')

        data = self.patch(f'/api/bookmarks/{bookmark_id}/visibility', {'is_archived': True}, **self.auth_headers())
        self.assertStatus(200)
        self.assertTrue(data['is_archived'])

        self.post(f'/api/bookmarks/{bookmark_id}/move', {'direction': 'down'}, **self.auth_headers())
        self.assertStatus(200)

        self.delete(f'/api/bookmarks/{bookmark_id}', **self.auth_headers())
        self.assertStatus(204)


class TestBookmarkWorkspaceIsolationAPI(BookmarkAPITestCase):
    """Every endpoint scopes to the user's CURRENT workspace - same user, other workspace -> 404."""

    def test_other_workspace_bookmark_invisible_and_unreachable(self):
        other_workspace = WorkspaceFactory()
        foreign = BookmarkFactory(
            user=self.user,
            budget=BudgetFactory(workspace=other_workspace, name='Other budget'),
            workspace=other_workspace,
            name='Other workspace view',
        )

        data = self.get('/api/bookmarks', **self.auth_headers())
        self.assertStatus(200)
        self.assertNotIn(foreign.id, [b['id'] for b in data])

        self.put(
            f'/api/bookmarks/{foreign.id}',
            {'name': 'Hijack', 'icon': 'home', 'color': 'teal'},
            **self.auth_headers(),
        )
        self.assertStatus(404)
        self.patch(f'/api/bookmarks/{foreign.id}/visibility', {'is_active': False}, **self.auth_headers())
        self.assertStatus(404)
        self.post(f'/api/bookmarks/{foreign.id}/move', {'direction': 'up'}, **self.auth_headers())
        self.assertStatus(404)
        self.delete(f'/api/bookmarks/{foreign.id}', **self.auth_headers())
        self.assertStatus(404)
        self.assertTrue(Bookmark.objects.filter(id=foreign.id).exists())
