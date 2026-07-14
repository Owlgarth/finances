from django.apps import AppConfig


class TransfersConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'transfers'

    def ready(self):
        """Import API module when app is ready."""
        import transfers.api  # noqa: F401
