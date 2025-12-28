import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('budget_accounts', '0001_initial'),
        ('workspaces', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='budgetaccount',
            name='created_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_budget_accounts', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='budgetaccount',
            name='updated_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='updated_budget_accounts', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='budgetaccount',
            name='workspace',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='budget_accounts', to='workspaces.workspace'),
        ),
        migrations.AlterUniqueTogether(
            name='budgetaccount',
            unique_together={('workspace', 'name')},
        ),
    ]
