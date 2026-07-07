"""Factory Boy factories for the workspaces app."""

import factory
from factory.django import DjangoModelFactory

from workspaces.models import Workspace, WorkspaceMember


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
