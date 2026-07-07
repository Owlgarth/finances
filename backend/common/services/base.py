"""Shared service helpers used across multiple Django apps."""


def delete_workspace_financial_records(workspace_id: int) -> None:
    """Delete all workspace records in correct order.

    Order matters due to PROTECT FKs (transactions/planned/transfers protect
    accounts; accounts and category budgets protect catalog currencies —
    global rows survive, workspace-custom rows cascade with the workspace).
    """
    from accounts.models import Account
    from budgeting.models import Budget, CategoryBudget
    from categories.models import Category
    from planned_transactions.models import PlannedTransaction
    from transactions.models import Transaction
    from transfers.models import Transfer

    Transfer.objects.for_workspace(workspace_id).delete()
    Transaction.objects.for_workspace(workspace_id).delete()
    PlannedTransaction.objects.for_workspace(workspace_id).delete()
    CategoryBudget.objects.for_workspace(workspace_id).delete()
    Category.objects.for_workspace(workspace_id).delete()
    Budget.objects.for_workspace(workspace_id).delete()  # cascades its periods
    Account.objects.for_workspace(workspace_id).delete()
