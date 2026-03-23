from datetime import date

from django.test import TestCase

from budget_periods.factories import BudgetPeriodFactory
from budget_periods.services import BudgetPeriodService
from common.services.base import delete_workspace_financial_records
from common.tests.factories import UserFactory
from currency_exchanges.models import CurrencyExchange
from planned_transactions.models import PlannedTransaction
from transactions.models import Transaction


class TestDeleteCascade(TestCase):
    def setUp(self):
        self.user = UserFactory()
        self.period = BudgetPeriodFactory(created_by=self.user)
        self.workspace = self.period.budget_account.workspace
        self.currency = self.workspace.currencies.first()

    def test_budget_period_delete_cascades_financial_records(self):
        """Test that deleting a period deletes its financial records."""
        Transaction.objects.create(
            budget_period=self.period, currency=self.currency, amount=100, date=date(2025, 1, 15), created_by=self.user
        )
        PlannedTransaction.objects.create(
            budget_period=self.period,
            currency=self.currency,
            amount=200,
            planned_date=date(2025, 1, 20),
            created_by=self.user,
        )
        CurrencyExchange.objects.create(
            budget_period=self.period,
            from_currency=self.currency,
            to_currency=self.currency,
            from_amount=10,
            to_amount=10,
            exchange_rate=1,
            date=date(2025, 1, 10),
            created_by=self.user,
        )

        self.assertEqual(Transaction.objects.filter(budget_period=self.period).count(), 1)
        self.assertEqual(PlannedTransaction.objects.filter(budget_period=self.period).count(), 1)
        self.assertEqual(CurrencyExchange.objects.filter(budget_period=self.period).count(), 1)

        BudgetPeriodService.delete(self.workspace.id, self.period.id)

        self.assertFalse(Transaction.objects.filter(budget_period=self.period).exists())
        self.assertEqual(Transaction.objects.count(), 0)
        self.assertEqual(PlannedTransaction.objects.count(), 0)
        self.assertEqual(CurrencyExchange.objects.count(), 0)

    def test_delete_workspace_financial_records_catches_orphans(self):
        """Test that orphaned records are deleted by delete_workspace_financial_records."""
        t = Transaction.objects.create(
            budget_period=self.period, currency=self.currency, amount=100, date=date(2025, 1, 15), created_by=self.user
        )
        pt = PlannedTransaction.objects.create(
            budget_period=self.period,
            currency=self.currency,
            amount=200,
            planned_date=date(2025, 1, 20),
            created_by=self.user,
        )

        self.period.delete()

        t.refresh_from_db()
        pt.refresh_from_db()
        self.assertIsNone(t.budget_period)
        self.assertIsNone(pt.budget_period)

        delete_workspace_financial_records(self.workspace.id)

        self.assertEqual(Transaction.objects.count(), 0)
        self.assertEqual(PlannedTransaction.objects.count(), 0)
