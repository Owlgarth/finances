import django.db.models.deletion
from django.db import migrations, models


def populate_currency_fk(apps, schema_editor):
    """Populate currency_fk from the old currency CharField."""
    PeriodBalance = apps.get_model('period_balances', 'PeriodBalance')
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
    for balance in PeriodBalance.objects.all():
        workspace_id = period_workspace.get(balance.budget_period_id)
        if workspace_id and balance.currency:
            currency_id = currency_cache.get((workspace_id, balance.currency))
            if currency_id:
                balance.currency_fk_id = currency_id
                to_update.append(balance)

    for balance in to_update:
        balance.save(update_fields=['currency_fk_id'])


class Migration(migrations.Migration):

    dependencies = [
        ('period_balances', '0002_initial'),
        ('workspaces', '0002_currency'),
    ]

    operations = [
        migrations.AlterUniqueTogether(
            name='periodbalance',
            unique_together=set(),
        ),
        migrations.AddField(
            model_name='periodbalance',
            name='currency_fk',
            field=models.ForeignKey(
                null=True,
                blank=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='period_balances',
                to='workspaces.currency',
            ),
        ),
        migrations.RunPython(populate_currency_fk, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='periodbalance',
            name='currency',
        ),
        migrations.RenameField(
            model_name='periodbalance',
            old_name='currency_fk',
            new_name='currency',
        ),
        migrations.AlterField(
            model_name='periodbalance',
            name='currency',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='period_balances',
                to='workspaces.currency',
            ),
        ),
        migrations.AlterUniqueTogether(
            name='periodbalance',
            unique_together={('budget_period', 'currency')},
        ),
    ]
