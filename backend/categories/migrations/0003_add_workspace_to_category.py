import django.db.models.deletion
from django.db import migrations, models


def backfill_workspace_id(apps, schema_editor):
    Category = apps.get_model('categories', 'Category')
    for category in Category.objects.select_related('budget_period__budget_account').all():
        category.workspace_id = category.budget_period.budget_account.workspace_id
        category.save(update_fields=['workspace_id'])


class Migration(migrations.Migration):
    dependencies = [
        ('categories', '0002_initial'),
        ('workspaces', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='category',
            name='workspace',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='categories',
                to='workspaces.workspace',
            ),
        ),
        migrations.RunPython(backfill_workspace_id, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='category',
            name='workspace',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='categories',
                to='workspaces.workspace',
            ),
        ),
    ]
