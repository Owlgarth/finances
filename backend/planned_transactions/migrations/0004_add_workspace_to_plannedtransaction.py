import django.db.models.deletion
from django.db import migrations, models


def backfill_workspace_id(apps, schema_editor):
    PlannedTransaction = apps.get_model('planned_transactions', 'PlannedTransaction')
    for pt in PlannedTransaction.objects.select_related('budget_period__budget_account').all():
        if pt.budget_period:
            pt.workspace_id = pt.budget_period.budget_account.workspace_id
            pt.save(update_fields=['workspace_id'])


class Migration(migrations.Migration):
    dependencies = [
        ('planned_transactions', '0003_currency_fk'),
        ('workspaces', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='plannedtransaction',
            name='workspace',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='planned_transactions',
                to='workspaces.workspace',
            ),
        ),
        migrations.RunPython(backfill_workspace_id, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='plannedtransaction',
            name='workspace',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='planned_transactions',
                to='workspaces.workspace',
            ),
        ),
    ]
