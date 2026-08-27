import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0003_account_is_default_for_currency_and_more'),
        ('currencies', '0003_workspacecurrency_position'),
        ('planned_transactions', '0003_plannedtransactionidempotencykey'),
    ]

    operations = [
        migrations.AddField(
            model_name='plannedtransaction',
            name='currency',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='planned_transactions',
                to='currencies.currency',
            ),
        ),
        migrations.AlterField(
            model_name='plannedtransaction',
            name='currency',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='planned_transactions',
                to='currencies.currency',
            ),
        ),
        migrations.AlterField(
            model_name='plannedtransaction',
            name='account',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='planned_transactions',
                to='accounts.account',
            ),
        ),
    ]
