"""Factory Boy factories for the workspaces app."""

import factory
from factory.django import DjangoModelFactory

from workspaces.models import UserWorkspaceSettings, Workspace, WorkspaceMember


class WorkspaceFactory(DjangoModelFactory):
    class Meta:
        model = Workspace

    name = factory.Faker('company')


class WorkspaceMemberFactory(DjangoModelFactory):
    class Meta:
        model = WorkspaceMember

    workspace = factory.SubFactory(WorkspaceFactory)
    user = factory.SubFactory('common.tests.factories.UserFactory')
    role = 'owner'


class UserWorkspaceSettingsFactory(DjangoModelFactory):
    """UserWorkspaceSettings factory.

    settings and version are left undeclared on purpose: the model field
    defaults supply {} and 1 (the bookmark factory's params precedent);
    tests needing a populated blob pass settings={...} explicitly.
    created_by/updated_by default to the row's own user - personal rows
    are always created by the user they belong to.
    """

    class Meta:
        model = UserWorkspaceSettings

    user = factory.SubFactory('common.tests.factories.UserFactory')
    workspace = factory.SubFactory(WorkspaceFactory)
    created_by = factory.LazyAttribute(lambda obj: obj.user)
    updated_by = factory.LazyAttribute(lambda obj: obj.user)
