# B7: planned transactions align with accounts — drop budget_period/currency
# FKs, add account FK. Data is disposable during the redesign (decision 10):
# existing rows are deleted so the non-null account FK can be added without a
# default.

import django.db.models.deletion
from django.db import migrations, models


def delete_all_planned(apps, schema_editor):
    PlannedTransaction = apps.get_model('planned_transactions', 'PlannedTransaction')
    PlannedTransaction.objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ('planned_transactions', '0004_add_workspace_to_plannedtransaction'),
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(delete_all_planned, migrations.RunPython.noop),
        migrations.RemoveField(model_name='plannedtransaction', name='budget_period'),
        migrations.RemoveField(model_name='plannedtransaction', name='currency'),
        migrations.AddField(
            model_name='plannedtransaction',
            name='account',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='planned_transactions',
                to='accounts.account',
            ),
        ),
    ]
