import django.db.models.deletion
from django.db import migrations, models


def populate_default_currency_fk(apps, schema_editor):
    """Populate default_currency_fk from the old default_currency CharField."""
    BudgetAccount = apps.get_model('budget_accounts', 'BudgetAccount')
    Currency = apps.get_model('workspaces', 'Currency')

    # Build cache: (workspace_id, symbol) -> currency_id
    currency_cache = {
        (c.workspace_id, c.symbol): c.id
        for c in Currency.objects.all()
    }

    to_update = []
    for account in BudgetAccount.objects.all():
        if account.default_currency and account.workspace_id:
            currency_id = currency_cache.get((account.workspace_id, account.default_currency))
            if currency_id:
                account.default_currency_fk_id = currency_id
                to_update.append(account)

    for account in to_update:
        account.save(update_fields=['default_currency_fk_id'])


class Migration(migrations.Migration):

    dependencies = [
        ('budget_accounts', '0002_initial'),
        ('workspaces', '0002_currency'),
    ]

    operations = [
        migrations.AddField(
            model_name='budgetaccount',
            name='default_currency_fk',
            field=models.ForeignKey(
                null=True,
                blank=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='budget_accounts',
                to='workspaces.currency',
            ),
        ),
        migrations.RunPython(populate_default_currency_fk, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='budgetaccount',
            name='default_currency',
        ),
        migrations.RenameField(
            model_name='budgetaccount',
            old_name='default_currency_fk',
            new_name='default_currency',
        ),
        migrations.AlterField(
            model_name='budgetaccount',
            name='default_currency',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='budget_accounts',
                to='workspaces.currency',
            ),
        ),
    ]
