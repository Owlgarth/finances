import django.db.models.deletion
from django.db import migrations, models


def backfill_workspace_id(apps, schema_editor):
    CurrencyExchange = apps.get_model('currency_exchanges', 'CurrencyExchange')
    for ce in CurrencyExchange.objects.select_related('budget_period__budget_account').all():
        if ce.budget_period:
            ce.workspace_id = ce.budget_period.budget_account.workspace_id
            ce.save(update_fields=['workspace_id'])


class Migration(migrations.Migration):
    dependencies = [
        ('currency_exchanges', '0003_currency_fk'),
        ('workspaces', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='currencyexchange',
            name='workspace',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='currency_exchanges',
                to='workspaces.workspace',
            ),
        ),
        migrations.RunPython(backfill_workspace_id, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='currencyexchange',
            name='workspace',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='currency_exchanges',
                to='workspaces.workspace',
            ),
        ),
    ]
