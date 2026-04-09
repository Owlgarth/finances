from django.db import migrations


def lowercase_emails(apps, schema_editor):
    User = apps.get_model('users', 'User')
    for user in User.objects.exclude(email__regex=r'^[a-z]').iterator():
        user.email = user.email.lower()
        if user.pending_email:
            user.pending_email = user.pending_email.lower()
        user.save(update_fields=['email', 'pending_email'])


class Migration(migrations.Migration):
    dependencies = [
        ('users', '0007_user_email_verified_user_pending_email'),
    ]

    operations = [
        migrations.RunPython(lowercase_emails, migrations.RunPython.noop),
    ]
