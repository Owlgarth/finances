from django.apps import AppConfig


class BudgetingConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'budgeting'

    def ready(self):
        """Import API module when app is ready."""
        import budgeting.api  # noqa: F401
