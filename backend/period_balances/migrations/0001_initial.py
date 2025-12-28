import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('budget_periods', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='PeriodBalance',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('currency', models.CharField(max_length=3)),
                ('opening_balance', models.DecimalField(decimal_places=2, default=0, max_digits=15)),
                ('total_income', models.DecimalField(decimal_places=2, default=0, max_digits=15)),
                ('total_expenses', models.DecimalField(decimal_places=2, default=0, max_digits=15)),
                ('exchanges_in', models.DecimalField(decimal_places=2, default=0, max_digits=15)),
                ('exchanges_out', models.DecimalField(decimal_places=2, default=0, max_digits=15)),
                ('closing_balance', models.DecimalField(decimal_places=2, default=0, max_digits=15)),
                ('last_calculated_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True, null=True)),
                ('budget_period', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='period_balances', to='budget_periods.budgetperiod')),
            ],
            options={
                'db_table': 'period_balances',
            },
        ),
    ]
