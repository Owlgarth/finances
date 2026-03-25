import django.db.models.deletion
from django.db import migrations, models


def backfill_workspace_id(apps, schema_editor):
    BudgetPeriod = apps.get_model('budget_periods', 'BudgetPeriod')
    for period in BudgetPeriod.objects.select_related('budget_account').all():
        period.workspace_id = period.budget_account.workspace_id
        period.save(update_fields=['workspace_id'])


class Migration(migrations.Migration):
    dependencies = [
        ('budget_periods', '0002_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='budgetperiod',
            name='workspace',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='budget_periods',
                to='workspaces.workspace',
            ),
        ),
        migrations.RunPython(backfill_workspace_id, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='budgetperiod',
            name='workspace',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='budget_periods',
                to='workspaces.workspace',
            ),
        ),
    ]
