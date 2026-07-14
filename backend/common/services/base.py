"""Shared service helpers used across multiple Django apps."""


def delete_workspace_financial_records(workspace_id: int) -> None:
    """Delete all of a workspace's domain records in dependency order.

    Order matters due to PROTECT FKs (transactions/planned/transfers protect
    accounts; accounts and category budgets protect catalog currencies).
    Global catalog currencies survive; workspace-custom currency rows are
    deleted here after their enablements and referencing records are gone —
    otherwise WorkspaceCurrency.currency (PROTECT) would block the cascade.
    """
    from accounts.models import Account
    from budgeting.models import Budget, CategoryBudget
    from categories.models import Category
    from currencies.models import Currency, WorkspaceCurrency
    from planned_transactions.models import PlannedTransaction
    from transactions.attachments import AttachmentService
    from transactions.models import Transaction
    from transfers.models import Transfer

    # Stored attachment files first — the row cascade below can't reach S3.
    AttachmentService.delete_storage_for_transactions(Transaction.objects.for_workspace(workspace_id))

    Transfer.objects.for_workspace(workspace_id).delete()
    Transaction.objects.for_workspace(workspace_id).delete()
    PlannedTransaction.objects.for_workspace(workspace_id).delete()
    CategoryBudget.objects.for_workspace(workspace_id).delete()
    Category.objects.for_workspace(workspace_id).delete()
    Budget.objects.for_workspace(workspace_id).delete()  # cascades its periods
    Account.objects.for_workspace(workspace_id).delete()
    # Currency enablements, then workspace-custom currency rows.
    WorkspaceCurrency.objects.filter(workspace_id=workspace_id).delete()
    Currency.objects.filter(workspace_id=workspace_id).delete()
