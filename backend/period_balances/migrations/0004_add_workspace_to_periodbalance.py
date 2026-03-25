import django.db.models.deletion
from django.db import migrations, models


def backfill_workspace_id(apps, schema_editor):
    PeriodBalance = apps.get_model('period_balances', 'PeriodBalance')
    for pb in PeriodBalance.objects.select_related('budget_period__budget_account').all():
        pb.workspace_id = pb.budget_period.budget_account.workspace_id
        pb.save(update_fields=['workspace_id'])


class Migration(migrations.Migration):
    dependencies = [
        ('period_balances', '0003_currency_fk'),
        ('workspaces', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='periodbalance',
            name='workspace',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='period_balances',
                to='workspaces.workspace',
            ),
        ),
        migrations.RunPython(backfill_workspace_id, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='periodbalance',
            name='workspace',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='period_balances',
                to='workspaces.workspace',
            ),
        ),
    ]
