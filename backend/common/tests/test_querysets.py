"""Unit tests for WorkspaceScopedQuerySet."""

from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase

from budget_periods.factories import BudgetPeriodFactory
from common.querysets import WorkspaceScopedQuerySet
from common.tests.factories import BudgetAccountFactory, UserFactory
from transactions.factories import TransactionFactory
from workspaces.factories import WorkspaceFactory

User = get_user_model()


class TestWorkspaceScopedQuerySet(TestCase):
    """Tests for WorkspaceScopedQuerySet.for_workspace() method."""

    def test_for_workspace_filters_by_direct_workspace_id(self):
        ws1 = WorkspaceFactory()
        ws2 = WorkspaceFactory()

        ws1_currencies = ws1.currencies.all()
        ws2_currencies = ws2.currencies.all()

        self.assertEqual(ws1_currencies.count(), 4)
        self.assertEqual(ws2_currencies.count(), 4)

        ws1_ids = set(ws1_currencies.values_list('id', flat=True))
        ws2_ids = set(ws2_currencies.values_list('id', flat=True))

        self.assertEqual(len(ws1_ids), 4)
        self.assertEqual(len(ws2_ids), 4)
        self.assertEqual(len(ws1_ids & ws2_ids), 0)

        for currency in ws1_currencies:
            self.assertEqual(currency.workspace_id, ws1.id)
        for currency in ws2_currencies:
            self.assertEqual(currency.workspace_id, ws2.id)

    def test_for_workspace_filters_by_nested_fk_path(self):
        ws1 = WorkspaceFactory()
        ws2 = WorkspaceFactory()

        user1 = UserFactory(current_workspace=ws1)
        user2 = UserFactory(current_workspace=ws2)

        account1 = BudgetAccountFactory(
            workspace=ws1,
            name='Account 1',
            default_currency=ws1.currencies.first(),
            created_by=user1,
            updated_by=user1,
        )
        account2 = BudgetAccountFactory(
            workspace=ws2,
            name='Account 2',
            default_currency=ws2.currencies.first(),
            created_by=user2,
            updated_by=user2,
        )

        period1 = BudgetPeriodFactory(
            budget_account=account1,
            name='Period 1',
            start_date=date(2024, 1, 1),
            end_date=date(2024, 1, 31),
            created_by=user1,
            updated_by=user1,
        )
        period2 = BudgetPeriodFactory(
            budget_account=account2,
            name='Period 2',
            start_date=date(2024, 1, 1),
            end_date=date(2024, 1, 31),
            created_by=user2,
            updated_by=user2,
        )

        txn1 = TransactionFactory(
            budget_period=period1,
            date=date(2024, 1, 15),
            description='Transaction 1',
            amount=100,
            type='income',
            currency=ws1.currencies.first(),
            created_by=user1,
            updated_by=user1,
        )
        TransactionFactory(
            budget_period=period2,
            date=date(2024, 1, 15),
            description='Transaction 2',
            amount=200,
            type='expense',
            currency=ws2.currencies.first(),
            created_by=user2,
            updated_by=user2,
        )

        from transactions.models import Transaction

        ws1_txns = Transaction.objects.for_workspace(ws1.id)
        ws2_txns = Transaction.objects.for_workspace(ws2.id)

        self.assertEqual(ws1_txns.count(), 1)
        self.assertEqual(ws2_txns.count(), 1)
        self.assertEqual(ws1_txns.first().id, txn1.id)

    def test_for_workspace_raises_valueerror_without_workspace_filter(self):
        qs = WorkspaceScopedQuerySet(model=User)
        with self.assertRaises(ValueError) as context:
            qs.for_workspace(1)
        self.assertIn('User', str(context.exception))
        self.assertIn('WORKSPACE_FILTER', str(context.exception))

    def test_for_workspace_returns_empty_queryset_for_nonexistent_workspace(self):
        WorkspaceFactory()

        from workspaces.models import Currency

        result = Currency.objects.for_workspace(99999)

        self.assertEqual(result.count(), 0)
        self.assertTrue(result.exists() is False)

    def test_for_workspace_raises_valueerror_for_none(self):
        WorkspaceFactory()
        from workspaces.models import Currency

        with self.assertRaises(ValueError) as context:
            Currency.objects.for_workspace(None)
        self.assertIn('workspace_id is required', str(context.exception))

    def test_for_workspace_raises_valueerror_for_zero(self):
        WorkspaceFactory()
        from workspaces.models import Currency

        with self.assertRaises(ValueError) as context:
            Currency.objects.for_workspace(0)
        self.assertIn('workspace_id is required', str(context.exception))
