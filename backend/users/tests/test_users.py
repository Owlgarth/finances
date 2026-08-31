"""Tests for user profile management."""

from django.contrib.auth import get_user_model

from core.tests.base import AuthTestCase


class TestUserUpdate(AuthTestCase):
    """Tests for user profile update."""

    def test_update_email_ignored(self):
        """Test that email field is ignored on profile update."""
        token = self.register_and_login('update_test@example.com', 'password123', 'Update Test')

        data = self.patch('/api/users/me', {'email': 'newemail@example.com'}, **self.auth_headers(token))
        self.assertStatus(200)
        self.assertEqual(data['email'], 'update_test@example.com')

    def test_update_full_name(self):
        """Test updating user full name."""
        token = self.register_and_login('name_test@example.com', 'password123', 'Name Test')

        data = self.patch('/api/users/me', {'full_name': 'Updated Name'}, **self.auth_headers(token))
        self.assertStatus(200)
        self.assertEqual(data['full_name'], 'Updated Name')

    def test_update_multiple_fields(self):
        """Test updating multiple fields at once (email is ignored)."""
        token = self.register_and_login('multi_test@example.com', 'password123', 'Multi Test')

        data = self.patch(
            '/api/users/me',
            {
                'email': 'multi_new@example.com',
                'full_name': 'Multi Updated',
            },
            **self.auth_headers(token),
        )
        self.assertStatus(200)
        self.assertEqual(data['email'], 'multi_test@example.com')
        self.assertEqual(data['full_name'], 'Multi Updated')

    def test_update_without_auth(self):
        """Test that update requires authentication."""
        self.patch('/api/users/me', {'full_name': 'Should Not Work'})
        self.assertStatus(401)


class TestPasswordChange(AuthTestCase):
    """Tests for password change functionality."""

    def test_change_password_success(self):
        """Test successful password change."""
        token = self.register_and_login('change_pass@example.com', 'oldpassword123', 'Password Test')
        before = get_user_model().objects.get(email='change_pass@example.com').password_changed_at

        data = self.put(
            '/api/users/me/password',
            {
                'current_password': 'oldpassword123',
                'new_password': 'newpassword456',
            },
            **self.auth_headers(token),
        )
        self.assertStatus(200)
        self.assertIn('successfully', data['message'].lower())

        # password_changed_at must be re-persisted by the change (update_fields fix)
        user = get_user_model().objects.get(email='change_pass@example.com')
        self.assertGreater(user.password_changed_at, before)

        # Verify new password works
        self.post(
            '/api/auth/login',
            {
                'email': 'change_pass@example.com',
                'password': 'newpassword456',
            },
        )
        self.assertStatus(200)

    def test_change_password_wrong_current(self):
        """Test password change with incorrect current password returns 401 (authentication error)."""
        token = self.register_and_login('wrong_current@example.com', 'correctpassword', 'Password Test')

        self.put(
            '/api/users/me/password',
            {
                'current_password': 'wrongpassword',
                'new_password': 'newpassword456',
            },
            **self.auth_headers(token),
        )
        self.assertStatus(401)

    def test_change_password_without_auth(self):
        """Test that password change requires authentication."""
        self.put(
            '/api/users/me/password',
            {
                'current_password': 'oldpassword',
                'new_password': 'newpassword',
            },
        )
        self.assertStatus(401)

    def test_change_password_too_short(self):
        """Test password change with new password too short."""
        token = self.register_and_login('short_pass@example.com', 'oldpassword123', 'Password Test')

        self.put(
            '/api/users/me/password',
            {
                'current_password': 'oldpassword123',
                'new_password': 'short',
            },
            **self.auth_headers(token),
        )
        self.assertStatus(422)


class TestPreferences(AuthTestCase):
    """Tests for the language and number_format preference fields."""

    def test_get_preferences_defaults(self):
        """Fresh preferences carry the settings/registry defaults for the new fields."""
        token = self.register_and_login('prefs_default@example.com', 'password123', 'Prefs Test')

        data = self.get('/api/users/me/preferences', **self.auth_headers(token))
        self.assertStatus(200)
        self.assertEqual(data['calendar_start_day'], 1)
        self.assertEqual(data['font_family'], 'geist')
        self.assertEqual(data['language'], 'en')
        self.assertEqual(data['number_format'], 'en')

    def test_update_language_and_number_format(self):
        """Valid registry codes are accepted and persisted."""
        token = self.register_and_login('prefs_update@example.com', 'password123', 'Prefs Test')

        data = self.patch(
            '/api/users/me/preferences',
            {'language': 'uk', 'number_format': 'eu'},
            **self.auth_headers(token),
        )
        self.assertStatus(200)
        self.assertEqual(data['language'], 'uk')
        self.assertEqual(data['number_format'], 'eu')

    def test_update_invalid_language_rejected(self):
        """Language codes outside the registry are rejected with 422."""
        token = self.register_and_login('prefs_bad_lang@example.com', 'password123', 'Prefs Test')

        self.patch('/api/users/me/preferences', {'language': 'xx'}, **self.auth_headers(token))
        self.assertStatus(422)

    def test_update_invalid_number_format_rejected(self):
        """Number format codes outside the registry are rejected with 422."""
        token = self.register_and_login('prefs_bad_fmt@example.com', 'password123', 'Prefs Test')

        self.patch('/api/users/me/preferences', {'number_format': 'xx'}, **self.auth_headers(token))
        self.assertStatus(422)

    def test_validation_is_registry_driven(self):
        """Every registry entry validates - the check is not a hardcoded 'en' allowlist."""
        token = self.register_and_login('prefs_registry@example.com', 'password123', 'Prefs Test')

        data = self.patch(
            '/api/users/me/preferences',
            {'language': 'pl', 'number_format': 'eu'},
            **self.auth_headers(token),
        )
        self.assertStatus(200)
        self.assertEqual(data['language'], 'pl')


class TestPreferencesMessageLocalization(AuthTestCase):
    """Accept-Language mechanism proof for schema validator messages.

    No compiled catalogs exist yet, so every locale still renders the
    English msgid. These tests pin the plumbing: the message is
    server-rendered per the request's Accept-Language header, and the
    no-header default is English.
    """

    def test_validator_message_rendered_per_accept_language(self):
        """The validator message is rendered server-side under the request's Accept-Language locale."""
        token = self.register_and_login('prefs_lang_pl@example.com', 'password123', 'Prefs Test')
        self.patch(
            '/api/users/me/preferences',
            {'calendar_start_day': 13},
            **self.auth_headers(token),
            HTTP_ACCEPT_LANGUAGE='pl',
        )
        self.assertStatus(422)
        # Ninja's 422 detail is a list of error dicts; str() makes the
        # assertion robust to that shape.
        self.assertIn('calendar_start_day must be between 1 and 7', str(self.response.json()['detail']))

    def test_validator_message_english_without_header(self):
        """Without an Accept-Language header the message falls back to the LANGUAGE_CODE default (English)."""
        token = self.register_and_login('prefs_lang_none@example.com', 'password123', 'Prefs Test')
        self.patch('/api/users/me/preferences', {'calendar_start_day': 13}, **self.auth_headers(token))
        self.assertStatus(422)
        self.assertIn('calendar_start_day must be between 1 and 7', str(self.response.json()['detail']))
