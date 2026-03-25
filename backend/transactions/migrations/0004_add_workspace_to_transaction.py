import django.db.models.deletion
from django.db import migrations, models


def backfill_workspace_id(apps, schema_editor):
    Transaction = apps.get_model('transactions', 'Transaction')
    for trans in Transaction.objects.select_related('budget_period__budget_account').all():
        if trans.budget_period:
            trans.workspace_id = trans.budget_period.budget_account.workspace_id
            trans.save(update_fields=['workspace_id'])


class Migration(migrations.Migration):
    dependencies = [
        ('transactions', '0003_currency_fk'),
        ('workspaces', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='transaction',
            name='workspace',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='transactions',
                to='workspaces.workspace',
            ),
        ),
        migrations.RunPython(backfill_workspace_id, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='transaction',
            name='workspace',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='transactions',
                to='workspaces.workspace',
            ),
        ),
    ]
