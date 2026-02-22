import django.db.models.deletion
from django.db import migrations, models


def populate_currency_fks(apps, schema_editor):
    """Populate from_currency_fk and to_currency_fk from the old CharFields."""
    CurrencyExchange = apps.get_model('currency_exchanges', 'CurrencyExchange')
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
    for exchange in CurrencyExchange.objects.all():
        workspace_id = period_workspace.get(exchange.budget_period_id) if exchange.budget_period_id else None
        if not workspace_id:
            continue

        update_fields = []
        if exchange.from_currency:
            currency_id = currency_cache.get((workspace_id, exchange.from_currency))
            if currency_id:
                exchange.from_currency_fk_id = currency_id
                update_fields.append('from_currency_fk_id')

        if exchange.to_currency:
            currency_id = currency_cache.get((workspace_id, exchange.to_currency))
            if currency_id:
                exchange.to_currency_fk_id = currency_id
                update_fields.append('to_currency_fk_id')

        if update_fields:
            to_update.append((exchange, update_fields))

    for exchange, fields in to_update:
        exchange.save(update_fields=fields)


class Migration(migrations.Migration):

    dependencies = [
        ('currency_exchanges', '0002_initial'),
        ('workspaces', '0002_currency'),
    ]

    operations = [
        migrations.AddField(
            model_name='currencyexchange',
            name='from_currency_fk',
            field=models.ForeignKey(
                null=True,
                blank=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='exchanges_from',
                to='workspaces.currency',
            ),
        ),
        migrations.AddField(
            model_name='currencyexchange',
            name='to_currency_fk',
            field=models.ForeignKey(
                null=True,
                blank=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='exchanges_to',
                to='workspaces.currency',
            ),
        ),
        migrations.RunPython(populate_currency_fks, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='currencyexchange',
            name='from_currency',
        ),
        migrations.RemoveField(
            model_name='currencyexchange',
            name='to_currency',
        ),
        migrations.RenameField(
            model_name='currencyexchange',
            old_name='from_currency_fk',
            new_name='from_currency',
        ),
        migrations.RenameField(
            model_name='currencyexchange',
            old_name='to_currency_fk',
            new_name='to_currency',
        ),
        migrations.AlterField(
            model_name='currencyexchange',
            name='from_currency',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='exchanges_from',
                to='workspaces.currency',
            ),
        ),
        migrations.AlterField(
            model_name='currencyexchange',
            name='to_currency',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='exchanges_to',
                to='workspaces.currency',
            ),
        ),
    ]
