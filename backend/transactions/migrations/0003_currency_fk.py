import django.db.models.deletion
from django.db import migrations, models


def populate_currency_fk(apps, schema_editor):
    """Populate currency_fk from the old currency CharField."""
    Transaction = apps.get_model('transactions', 'Transaction')
    Currency = apps.get_model('workspaces', 'Currency')
    BudgetPeriod = apps.get_model('budget_periods', 'BudgetPeriod')
    BudgetAccount = apps.get_model('budget_accounts', 'BudgetAccount')

    # Build period -> workspace cache
    account_workspace = {a.id: a.workspace_id for a in BudgetAccount.objects.all()}
    period_workspace = {
        p.id: account_workspace.get(p.budget_account_id)
        for p in BudgetPeriod.objects.all()
    }

    # Build currency cache: (workspace_id, symbol) -> currency_id
    currency_cache = {
        (c.workspace_id, c.symbol): c.id
        for c in Currency.objects.all()
    }

    to_update = []
    for trans in Transaction.objects.all():
        workspace_id = period_workspace.get(trans.budget_period_id) if trans.budget_period_id else None
        if workspace_id and trans.currency:
            currency_id = currency_cache.get((workspace_id, trans.currency))
            if currency_id:
                trans.currency_fk_id = currency_id
                to_update.append(trans)

    for trans in to_update:
        trans.save(update_fields=['currency_fk_id'])


class Migration(migrations.Migration):

    dependencies = [
        ('transactions', '0002_initial'),
        ('workspaces', '0002_currency'),
    ]

    operations = [
        migrations.AddField(
            model_name='transaction',
            name='currency_fk',
            field=models.ForeignKey(
                null=True,
                blank=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='transactions',
                to='workspaces.currency',
            ),
        ),
        migrations.RunPython(populate_currency_fk, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='transaction',
            name='currency',
        ),
        migrations.RenameField(
            model_name='transaction',
            old_name='currency_fk',
            new_name='currency',
        ),
        migrations.AlterField(
            model_name='transaction',
            name='currency',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='transactions',
                to='workspaces.currency',
            ),
        ),
    ]
