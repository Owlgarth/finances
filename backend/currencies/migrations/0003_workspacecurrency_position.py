from django.db import migrations, models


class Migration(migrations.Migration):
    """WorkspaceCurrency.position: explicit user-reorderable order (PR #105 item C)."""

    dependencies = [
        ('currencies', '0002_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='workspacecurrency',
            name='position',
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AlterModelOptions(
            name='workspacecurrency',
            options={'ordering': ['position', 'id'], 'verbose_name_plural': 'workspace currencies'},
        ),
    ]
