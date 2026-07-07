from django.test import TestCase

from budget_periods.factories import BudgetPeriodFactory
from budget_periods.services import BudgetPeriodService
from common.services.base import delete_workspace_financial_records
from common.tests.factories import UserFactory
from currency_exchanges.factories import CurrencyExchangeFactory
from currency_exchanges.models import CurrencyExchange
from planned_transactions.factories import PlannedTransactionFactory
from planned_transactions.models import PlannedTransaction
from transactions.factories import TransactionFactory
from transactions.models import Transaction


class TestDeleteCascade(TestCase):
    def setUp(self):
        self.user = UserFactory()
        self.period = BudgetPeriodFactory(created_by=self.user)
        self.workspace = self.period.budget_account.workspace
        self.currency = self.workspace.currencies.first()

    def test_budget_period_delete_cascades_financial_records(self):
        """Deleting a period deletes its period-scoped legacy records.

        Transactions and planned transactions live on accounts since B5/B7
        and survive period deletion.
        """
        CurrencyExchangeFactory(
            budget_period=self.period,
            workspace=self.workspace,
            from_currency=self.currency,
            to_currency=self.currency,
            created_by=self.user,
        )

        self.assertEqual(CurrencyExchange.objects.filter(budget_period=self.period).count(), 1)

        BudgetPeriodService.delete(self.workspace.id, self.period.id)

        self.assertEqual(CurrencyExchange.objects.count(), 0)

    def test_delete_workspace_financial_records_catches_orphans(self):
        """All workspace records are deleted by delete_workspace_financial_records."""
        from accounts.factories import AccountFactory

        account = AccountFactory(workspace=self.workspace)
        TransactionFactory(account=account, workspace=self.workspace, created_by=self.user)
        PlannedTransactionFactory(account=account, workspace=self.workspace, created_by=self.user)
        PlannedTransactionFactory(account=account, workspace=self.workspace, created_by=self.user)

        self.period.delete()

        delete_workspace_financial_records(self.workspace.id)

        self.assertEqual(Transaction.objects.count(), 0)
        self.assertEqual(PlannedTransaction.objects.count(), 0)
        self.assertEqual(CurrencyExchange.objects.count(), 0)
