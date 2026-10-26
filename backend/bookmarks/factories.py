"""Factory Boy factories for the bookmarks app."""

import factory
from factory.django import DjangoModelFactory

from bookmarks.models import Bookmark, BookmarkKind


class BookmarkFactory(DjangoModelFactory):
    """Bookmark factory.

    Budget-kind by default, with the budget and workspace derived via the
    budget factory's own workspace. Filter-kind rows pass budget=None
    together with currency_code=None AND an explicit workspace (the
    workspace LazyAttribute cannot derive from a None budget):
    BookmarkFactory(kind='transactions', budget=None, currency_code=None,
    workspace=self.workspace, user=self.user, params={'account': '5'}).

    params is left undeclared on purpose: the model field default (dict)
    supplies {} - matching the recorded rule that budget bookmarks carry an
    empty params object.
    """

    class Meta:
        model = Bookmark

    user = factory.SubFactory('common.tests.factories.UserFactory')
    budget = factory.SubFactory('budgeting.factories.BudgetFactory')
    workspace = factory.LazyAttribute(lambda obj: obj.budget.workspace)
    kind = BookmarkKind.BUDGET
    name = factory.Sequence(lambda n: f'Bookmark {n}')
    icon = 'bookmark'
    color = 'neutral'
    position = 0
    is_active = True
    is_archived = False
    currency_code = 'USD'
    created_by = factory.SubFactory('common.tests.factories.UserFactory')
    updated_by = factory.SubFactory('common.tests.factories.UserFactory')
