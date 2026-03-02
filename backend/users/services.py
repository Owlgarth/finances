"""Business logic for the users app."""

from ninja.errors import HttpError

from core.schemas import UserPreferencesUpdate, UserUpdate
from users.models import User, UserPreferences, WeekdayChoices


class UserService:
    @staticmethod
    def get_or_create_preferences(user: User) -> UserPreferences:
        """Get or create user preferences."""
        preferences, _ = UserPreferences.objects.get_or_create(
            user=user, defaults={'calendar_start_day': WeekdayChoices.SUNDAY}
        )
        return preferences

    @staticmethod
    def update_preferences(user: User, data: UserPreferencesUpdate) -> UserPreferences:
        """Update user preferences with validation."""
        if data.calendar_start_day < 1 or data.calendar_start_day > 7:
            raise HttpError(400, 'calendar_start_day must be between 1 and 7')

        preferences = UserService.get_or_create_preferences(user)
        preferences.calendar_start_day = data.calendar_start_day
        preferences.save()
        return preferences

    @staticmethod
    def update_profile(user: User, data: UserUpdate) -> User:
        """Update user profile information."""
        if data.email is not None:
            user.email = data.email
        if data.full_name is not None:
            user.full_name = data.full_name
        if data.is_active is not None:
            user.is_active = data.is_active

        user.save()
        return user

    @staticmethod
    def change_password(user: User, current_password: str, new_password: str) -> None:
        """Change user password with validation."""
        if not user.check_password(current_password):
            raise HttpError(401, 'Invalid current password')

        user.set_password(new_password)
        user.save()
