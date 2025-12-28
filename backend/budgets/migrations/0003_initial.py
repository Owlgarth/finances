import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('budgets', '0002_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='budget',
            name='created_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_budgets', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='budget',
            name='updated_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='updated_budgets', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AlterUniqueTogether(
            name='budget',
            unique_together={('budget_period', 'category', 'currency')},
        ),
    ]
