import django.db.models.deletion
from django.db import migrations, models


def populate_currency_fk(apps, schema_editor):
    """Populate currency_fk from the old currency CharField."""
    PlannedTransaction = apps.get_model('planned_transactions', 'PlannedTransaction')
    Currency = apps.get_model('workspaces', 'Currency')
    BudgetPeriod = apps.get_model('budget_periods', 'BudgetPeriod')
    BudgetAccount = apps.get_model('budget_accounts', 'BudgetAccount')

    account_workspace = {a.id: a.workspace_id for a in BudgetAccount.objects.all()}
    period_workspace = {
        p.id: account_workspace.get(p.budget_account_id)
        for p in BudgetPeriod.objects.all()
    }

    currency_cache = {
        (c.workspace_id, c.symbol): c.id
        for c in Currency.objects.all()
    }

    to_update = []
    for pt in PlannedTransaction.objects.all():
        workspace_id = period_workspace.get(pt.budget_period_id) if pt.budget_period_id else None
        if workspace_id and pt.currency:
            currency_id = currency_cache.get((workspace_id, pt.currency))
            if currency_id:
                pt.currency_fk_id = currency_id
                to_update.append(pt)

    for pt in to_update:
        pt.save(update_fields=['currency_fk_id'])


class Migration(migrations.Migration):

    dependencies = [
        ('planned_transactions', '0002_initial'),
        ('workspaces', '0002_currency'),
    ]

    operations = [
        migrations.AddField(
            model_name='plannedtransaction',
            name='currency_fk',
            field=models.ForeignKey(
                null=True,
                blank=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='planned_transactions',
                to='workspaces.currency',
            ),
        ),
        migrations.RunPython(populate_currency_fk, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='plannedtransaction',
            name='currency',
        ),
        migrations.RenameField(
            model_name='plannedtransaction',
            old_name='currency_fk',
            new_name='currency',
        ),
        migrations.AlterField(
            model_name='plannedtransaction',
            name='currency',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='planned_transactions',
                to='workspaces.currency',
            ),
        ),
    ]
