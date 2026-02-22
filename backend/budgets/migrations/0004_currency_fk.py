import django.db.models.deletion
from django.db import migrations, models


def populate_currency_fk(apps, schema_editor):
    """Populate currency_fk from the old currency CharField."""
    Budget = apps.get_model('budgets', 'Budget')
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
    for budget in Budget.objects.all():
        workspace_id = period_workspace.get(budget.budget_period_id)
        if workspace_id and budget.currency:
            currency_id = currency_cache.get((workspace_id, budget.currency))
            if currency_id:
                budget.currency_fk_id = currency_id
                to_update.append(budget)

    for budget in to_update:
        budget.save(update_fields=['currency_fk_id'])


class Migration(migrations.Migration):

    dependencies = [
        ('budgets', '0003_initial'),
        ('workspaces', '0002_currency'),
    ]

    operations = [
        migrations.AlterUniqueTogether(
            name='budget',
            unique_together=set(),
        ),
        migrations.AddField(
            model_name='budget',
            name='currency_fk',
            field=models.ForeignKey(
                null=True,
                blank=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='budgets',
                to='workspaces.currency',
            ),
        ),
        migrations.RunPython(populate_currency_fk, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='budget',
            name='currency',
        ),
        migrations.RenameField(
            model_name='budget',
            old_name='currency_fk',
            new_name='currency',
        ),
        migrations.AlterField(
            model_name='budget',
            name='currency',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='budgets',
                to='workspaces.currency',
            ),
        ),
        migrations.AlterUniqueTogether(
            name='budget',
            unique_together={('budget_period', 'category', 'currency')},
        ),
    ]
