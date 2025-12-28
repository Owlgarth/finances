import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('budget_accounts', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='BudgetPeriod',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100)),
                ('start_date', models.DateField()),
                ('end_date', models.DateField()),
                ('weeks', models.IntegerField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True, null=True)),
                ('budget_account', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='budget_periods', to='budget_accounts.budgetaccount')),
            ],
            options={
                'db_table': 'budget_periods',
            },
        ),
    ]
