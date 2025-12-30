"""Tests for user profile management."""

from core.tests.base import AuthTestCase


class TestUserUpdate(AuthTestCase):
    """Tests for user profile update."""

    def test_update_email(self):
        """Test updating user email."""
        token = self.register_and_login('update_test@example.com', 'password123', 'Update Test')

        data = self.patch('/api/users/me', {'email': 'newemail@example.com'}, **self.auth_headers(token))
        self.assertStatus(200)
        self.assertEqual(data['email'], 'newemail@example.com')

    def test_update_full_name(self):
        """Test updating user full name."""
        token = self.register_and_login('name_test@example.com', 'password123', 'Name Test')

        data = self.patch('/api/users/me', {'full_name': 'Updated Name'}, **self.auth_headers(token))
        self.assertStatus(200)
        self.assertEqual(data['full_name'], 'Updated Name')

    def test_update_multiple_fields(self):
        """Test updating multiple fields at once."""
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
        self.assertEqual(data['email'], 'multi_new@example.com')
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
        """Test password change with incorrect current password."""
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
