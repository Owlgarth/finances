"""Transaction: optional account + mandatory own currency."""

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0003_account_is_default_for_currency_and_more'),
        ('categories', '0002_initial'),
        ('currencies', '0003_workspacecurrency_position'),
        ('transactions', '0007_remove_transactionidempotencykey_unique_key_per_user_and_more'),
        ('workspaces', '0002_workspace_default_budget'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name='transaction',
            name='account',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='transactions',
                to='accounts.account',
            ),
        ),
        # Added nullable, then tightened in the same migration: no data
        # backfill exists (no-existing-data decision). Dev DBs with rows must
        # be dropped and recreated before migrating.
        migrations.AddField(
            model_name='transaction',
            name='currency',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='transactions',
                to='currencies.currency',
            ),
        ),
        migrations.AlterField(
            model_name='transaction',
            name='currency',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='transactions',
                to='currencies.currency',
            ),
        ),
        migrations.AddIndex(
            model_name='transaction',
            index=models.Index(fields=['currency', 'date'], name='transaction_currenc_ec2a26_idx'),
        ),
    ]
