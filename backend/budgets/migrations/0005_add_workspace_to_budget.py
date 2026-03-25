import django.db.models.deletion
from django.db import migrations, models


def backfill_workspace_id(apps, schema_editor):
    Budget = apps.get_model('budgets', 'Budget')
    for budget in Budget.objects.select_related('budget_period__budget_account').all():
        budget.workspace_id = budget.budget_period.budget_account.workspace_id
        budget.save(update_fields=['workspace_id'])


class Migration(migrations.Migration):
    dependencies = [
        ('budgets', '0004_currency_fk'),
        ('workspaces', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='budget',
            name='workspace',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='budgets',
                to='workspaces.workspace',
            ),
        ),
        migrations.RunPython(backfill_workspace_id, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='budget',
            name='workspace',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='budgets',
                to='workspaces.workspace',
            ),
        ),
    ]
