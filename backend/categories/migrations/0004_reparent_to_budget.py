# B4: re-parent Category from budget_period to budgeting.Budget.
# Data is disposable during the redesign (decision 10): existing rows are
# deleted so the non-null budget FK can be added without a default.

import django.db.models.deletion
from django.db import migrations, models
from django.db.models.functions import Lower


def delete_all_categories(apps, schema_editor):
    Category = apps.get_model('categories', 'Category')
    Category.objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ('categories', '0003_add_workspace_to_category'),
        ('budgeting', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(delete_all_categories, migrations.RunPython.noop),
        migrations.AlterUniqueTogether(name='category', unique_together=set()),
        migrations.RemoveField(model_name='category', name='budget_period'),
        migrations.AddField(
            model_name='category',
            name='budget',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='categories',
                to='budgeting.budget',
            ),
        ),
        migrations.AddField(
            model_name='category',
            name='is_archived',
            field=models.BooleanField(default=False),
        ),
        migrations.AlterModelOptions(
            name='category',
            options={'ordering': ['name'], 'verbose_name_plural': 'Categories'},
        ),
        migrations.AddConstraint(
            model_name='category',
            constraint=models.UniqueConstraint(Lower('name'), models.F('budget'), name='uniq_category_name_per_budget_ci'),
        ),
    ]
