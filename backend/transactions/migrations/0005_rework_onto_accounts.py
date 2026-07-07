# B5: transactions move onto accounts — drop budget_period/currency FKs, add
# account FK, adjustment type, and the original amount/currency facet.
# Data is disposable during the redesign (decision 10): existing rows are
# deleted so the non-null account FK can be added without a default.

import django.db.models.deletion
from django.db import migrations, models
from django.db.models import Q


def delete_all_transactions(apps, schema_editor):
    Transaction = apps.get_model('transactions', 'Transaction')
    Transaction.objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ('transactions', '0004_add_workspace_to_transaction'),
        ('accounts', '0001_initial'),
        ('currencies', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(delete_all_transactions, migrations.RunPython.noop),
        migrations.RemoveField(model_name='transaction', name='budget_period'),
        migrations.RemoveField(model_name='transaction', name='currency'),
        migrations.AddField(
            model_name='transaction',
            name='account',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='transactions',
                to='accounts.account',
            ),
        ),
        migrations.AddField(
            model_name='transaction',
            name='original_amount',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=15, null=True),
        ),
        migrations.AddField(
            model_name='transaction',
            name='original_currency',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='+',
                to='currencies.currency',
            ),
        ),
        migrations.AlterField(
            model_name='transaction',
            name='type',
            field=models.CharField(
                choices=[('income', 'Income'), ('expense', 'Expense'), ('adjustment', 'Adjustment')],
                max_length=20,
            ),
        ),
        migrations.AddIndex(
            model_name='transaction',
            index=models.Index(fields=['account', 'date'], name='transaction_account_f34883_idx'),
        ),
        migrations.AddIndex(
            model_name='transaction',
            index=models.Index(fields=['workspace', 'date'], name='transaction_workspa_0f73ca_idx'),
        ),
        migrations.AddIndex(
            model_name='transaction',
            index=models.Index(fields=['category', 'date'], name='transaction_categor_3ca96c_idx'),
        ),
        migrations.AddConstraint(
            model_name='transaction',
            constraint=models.CheckConstraint(
                condition=(
                    Q(original_amount__isnull=True, original_currency__isnull=True)
                    | Q(original_amount__isnull=False, original_currency__isnull=False)
                ),
                name='original_facet_both_or_neither',
            ),
        ),
    ]
