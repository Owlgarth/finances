import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('planned_transactions', '0001_initial'),
        ('transactions', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='plannedtransaction',
            name='created_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_planned_transactions', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='plannedtransaction',
            name='transaction',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='planned_transactions', to='transactions.transaction'),
        ),
        migrations.AddField(
            model_name='plannedtransaction',
            name='updated_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='updated_planned_transactions', to=settings.AUTH_USER_MODEL),
        ),
    ]
