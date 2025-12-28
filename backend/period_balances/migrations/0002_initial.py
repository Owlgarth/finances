import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('period_balances', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='periodbalance',
            name='created_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_period_balances', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='periodbalance',
            name='updated_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='updated_period_balances', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AlterUniqueTogether(
            name='periodbalance',
            unique_together={('budget_period', 'currency')},
        ),
    ]
