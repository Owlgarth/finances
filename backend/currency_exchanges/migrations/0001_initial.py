import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('budget_periods', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='CurrencyExchange',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('date', models.DateField()),
                ('description', models.TextField(blank=True, null=True)),
                ('from_currency', models.CharField(max_length=3)),
                ('from_amount', models.DecimalField(decimal_places=2, max_digits=15)),
                ('to_currency', models.CharField(max_length=3)),
                ('to_amount', models.DecimalField(decimal_places=2, max_digits=15)),
                ('exchange_rate', models.DecimalField(blank=True, decimal_places=6, max_digits=15, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True, null=True)),
                ('budget_period', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='currency_exchanges', to='budget_periods.budgetperiod')),
            ],
            options={
                'db_table': 'currency_exchanges',
            },
        ),
    ]
