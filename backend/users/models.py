from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.db.models import IntegerChoices


class WeekdayChoices(IntegerChoices):
    MONDAY = 1, 'Monday'
    TUESDAY = 2, 'Tuesday'
    WEDNESDAY = 3, 'Wednesday'
    THURSDAY = 4, 'Thursday'
    FRIDAY = 5, 'Friday'
    SATURDAY = 6, 'Saturday'
    SUNDAY = 7, 'Sunday'


class UserManager(BaseUserManager):
    """Custom user manager for email-based authentication."""

    def normalize_email(self, email):
        return email.lower().strip()

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('The Email field must be set')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_active', True)

        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """User model with email-based authentication."""

    email = models.EmailField(max_length=255, unique=True, db_index=True)
    full_name = models.CharField(max_length=100, blank=True, null=True)
    current_workspace = models.ForeignKey(
        'workspaces.Workspace', on_delete=models.SET_NULL, null=True, blank=True, related_name='current_users'
    )
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    email_verified = models.BooleanField(default=False)
    pending_email = models.EmailField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []

    class Meta:
        db_table = 'users'

    def save(self, *args, **kwargs):
        if self.email:
            self.email = self.email.lower().strip()
        if self.pending_email:
            self.pending_email = self.pending_email.lower().strip()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.email


class FontChoices(models.TextChoices):
    GEIST = 'geist', 'Geist'
    INTER = 'inter', 'Inter'
    SYSTEM = 'system', 'System UI'
    ROBOTO = 'roboto', 'Roboto'
    LATO = 'lato', 'Lato'


class UserPreferences(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='preferences')
    calendar_start_day = models.IntegerField(
        choices=WeekdayChoices,
        default=WeekdayChoices.SUNDAY,
        help_text='First day of the week for calendars (1=Monday, 7=Sunday)',
    )
    font_family = models.CharField(
        max_length=20,
        choices=FontChoices,
        default=FontChoices.GEIST,
        help_text='Font family for the user interface',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'user_preferences'

    def __str__(self):
        return f'Preferences for {self.user.email}'


class ConsentType(models.TextChoices):
    TERMS_OF_SERVICE = 'terms_of_service', 'Terms of Service'
    PRIVACY_POLICY = 'privacy_policy', 'Privacy Policy'


class UserConsent(models.Model):
    """Tracks user consent for legal documents (GDPR Articles 6, 7).

    Each record represents a single consent grant. When a user withdraws
    consent, withdrawn_at is set rather than deleting the record, preserving
    the audit trail. When legal documents are updated (new version), users
    must re-consent — creating a new record with the new version.
    """

    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='consents')
    consent_type = models.CharField(max_length=50, choices=ConsentType.choices)
    version = models.CharField(max_length=20)  # e.g., '1.0', '2.0'
    granted_at = models.DateTimeField(auto_now_add=True)
    withdrawn_at = models.DateTimeField(null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        db_table = 'user_consents'
        indexes = [
            models.Index(fields=['user', 'consent_type']),
        ]

    def __str__(self):
        status = 'withdrawn' if self.withdrawn_at else 'active'
        email = self.user.email if self.user else '[deleted]'
        return f'{email} - {self.consent_type} v{self.version} ({status})'
