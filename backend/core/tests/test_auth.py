"""Tests for authentication endpoints."""

import time
from unittest.mock import patch

import pyotp
from django.contrib.auth import get_user_model
from django.test import override_settings

from users.two_factor import TwoFactorService
from workspaces.models import Workspace

from .base import AuthTestCase


class TestAuthRegister(AuthTestCase):
    """Tests for user registration."""

    def test_register_success(self):
        """Test successful user registration."""
        data = self.post(
            '/api/auth/register',
            {
                'email': 'newuser@example.com',
                'password': 'securepassword123',
                'full_name': 'New User',
                'workspace_name': 'My Workspace',
                'accepted_terms_version': '1.0',
                'accepted_privacy_version': '1.0',
            },
        )
        self.assertStatus(201)
        # Register now returns JWT token for automatic login
        self.assertIn('access_token', data)
        self.assertEqual(data['token_type'], 'bearer')
        self.assertEqual(len(data['access_token'].split('.')), 3)

    def test_register_creates_workspace(self):
        """Test that registration creates workspace, member, and budget account."""
        from budget_accounts.models import BudgetAccount
        from workspaces.models import WorkspaceMember

        self.post(
            '/api/auth/register',
            {
                'email': 'workspace_test@example.com',
                'password': 'securepassword123',
                'workspace_name': 'Test Workspace',
                'accepted_terms_version': '1.0',
                'accepted_privacy_version': '1.0',
            },
        )
        self.assertStatus(201)

        user = get_user_model().objects.get(email='workspace_test@example.com')
        self.assertIsNotNone(user.current_workspace)

        workspace = Workspace.objects.get(id=user.current_workspace.id)
        self.assertEqual(workspace.name, 'Test Workspace')
        self.assertEqual(workspace.owner, user)

        member = WorkspaceMember.objects.get(workspace=workspace, user=user)
        self.assertEqual(member.role, 'owner')

        budget_accounts = BudgetAccount.objects.filter(workspace=workspace)
        self.assertEqual(budget_accounts.count(), 2)
        account_names = {acc.name for acc in budget_accounts}
        self.assertIn('General', account_names)
        self.assertIn('Example Account', account_names)

    def test_register_creates_demo_fixtures(self):
        """Test that registration creates demo fixtures with example data."""
        from datetime import date, timedelta

        from budget_accounts.models import BudgetAccount
        from budget_periods.models import BudgetPeriod
        from budgets.models import Budget
        from categories.models import Category
        from currency_exchanges.models import CurrencyExchange
        from period_balances.models import PeriodBalance
        from planned_transactions.models import PlannedTransaction
        from transactions.models import Transaction

        self.post(
            '/api/auth/register',
            {
                'email': 'demo_fixtures@example.com',
                'password': 'securepassword123',
                'full_name': 'Demo User',
                'workspace_name': 'Demo Workspace',
                'accepted_terms_version': '1.0',
                'accepted_privacy_version': '1.0',
            },
        )
        self.assertStatus(201)

        user = get_user_model().objects.get(email='demo_fixtures@example.com')
        example_account = BudgetAccount.objects.get(
            workspace=user.current_workspace,
            name='Example Account',
        )
        self.assertEqual(example_account.description, 'Example budget account with demo data')

        period = BudgetPeriod.objects.get(budget_account=example_account)

        today = date.today()
        first_of_current_month = date(today.year, today.month, 1)
        last_month_date = first_of_current_month - timedelta(days=1)
        expected_period_name = last_month_date.strftime('%B %Y')
        self.assertEqual(period.name, expected_period_name)

        categories = Category.objects.filter(budget_period=period)
        self.assertEqual(categories.count(), 7)
        category_names = {cat.name for cat in categories}
        expected_categories = {
            'Food & Groceries',
            'Transportation',
            'Entertainment',
            'Bills & Utilities',
            'Shopping',
            'Health & Fitness',
            'Salary',
        }
        self.assertEqual(category_names, expected_categories)

        budgets = Budget.objects.filter(budget_period=period)
        self.assertEqual(budgets.count(), 6)

        transactions = Transaction.objects.filter(budget_period=period)
        self.assertGreaterEqual(transactions.count(), 10)
        self.assertGreaterEqual(transactions.filter(type='income').count(), 2)
        self.assertGreaterEqual(transactions.filter(type='expense').count(), 8)

        planned_count = PlannedTransaction.objects.filter(budget_period=period).count()
        self.assertGreaterEqual(planned_count, 3)

        exchanges_count = CurrencyExchange.objects.filter(budget_period=period).count()
        self.assertGreaterEqual(exchanges_count, 2)

        balances = PeriodBalance.objects.filter(budget_period=period)
        self.assertEqual(balances.count(), 3)
        currencies = {bal.currency.symbol for bal in balances}
        self.assertEqual(currencies, {'PLN', 'EUR', 'USD'})

    def test_register_duplicate_email(self):
        """Test registration with already registered email."""
        self.post(
            '/api/auth/register',
            {
                'email': 'duplicate@example.com',
                'password': 'securepassword123',
                'workspace_name': 'Workspace 1',
                'accepted_terms_version': '1.0',
                'accepted_privacy_version': '1.0',
            },
        )
        self.assertStatus(201)

        self.post(
            '/api/auth/register',
            {
                'email': 'duplicate@example.com',
                'password': 'securepassword123',
                'workspace_name': 'Workspace 2',
                'accepted_terms_version': '1.0',
                'accepted_privacy_version': '1.0',
            },
        )
        self.assertStatus(400)
        self.assertIn('already exists', self.response.json()['error'].lower())

    def test_register_missing_required_fields(self):
        """Test registration with missing required fields."""
        self.post('/api/auth/register', {'email': 'incomplete@example.com'})
        self.assertStatus(422)

    def test_register_invalid_email_format(self):
        """Test registration with invalid email format."""
        self.post(
            '/api/auth/register',
            {
                'email': 'not-an-email',
                'password': 'securepassword123',
                'workspace_name': 'Workspace',
            },
        )
        self.assertStatus(422)

    def test_register_password_too_short(self):
        """Test registration with password too short."""
        self.post(
            '/api/auth/register',
            {
                'email': 'test@example.com',
                'password': 'short',
                'workspace_name': 'Workspace',
            },
        )
        self.assertStatus(422)


class TestAuthLogin(AuthTestCase):
    """Tests for user login."""

    def test_login_success(self):
        """Test successful login returns valid JWT."""
        self.register_and_login('login_test@example.com', 'securepassword123', 'Login Test')

        data = self.post(
            '/api/auth/login',
            {
                'email': 'login_test@example.com',
                'password': 'securepassword123',
            },
        )
        self.assertStatus(200)
        self.assertIn('access_token', data)
        self.assertEqual(data['token_type'], 'bearer')
        self.assertEqual(len(data['access_token'].split('.')), 3)

    def test_login_wrong_password(self):
        """Test login with incorrect password."""
        self.register_and_login('wrong_pass@example.com', 'correctpassword', 'Test')

        self.post(
            '/api/auth/login',
            {
                'email': 'wrong_pass@example.com',
                'password': 'wrongpassword',
            },
        )
        self.assertStatus(401)
        self.assertIn('invalid', self.response.json()['detail'].lower())

    def test_login_nonexistent_user(self):
        """Test login with non-existent email."""
        self.post(
            '/api/auth/login',
            {
                'email': 'nonexistent@example.com',
                'password': 'anypassword',
            },
        )
        self.assertStatus(401)

    def test_login_inactive_user(self):
        """Test login with inactive user account."""
        from django.contrib.auth import get_user_model

        self.register_and_login('inactive_user@example.com', 'securepassword123', 'Inactive Test')

        user = get_user_model().objects.get(email='inactive_user@example.com')
        user.is_active = False
        user.save()

        self.post(
            '/api/auth/login',
            {
                'email': 'inactive_user@example.com',
                'password': 'securepassword123',
            },
        )
        self.assertStatus(401)


class TestProtectedEndpoints(AuthTestCase):
    """Tests for protected endpoint access."""

    def test_protected_endpoint_without_token(self):
        """Test that protected endpoints reject requests without token."""
        self.get('/api/users/me')
        self.assertStatus(401)

    def test_protected_endpoint_with_invalid_token(self):
        """Test that protected endpoints reject invalid tokens."""
        self.get('/api/users/me', HTTP_AUTHORIZATION='Bearer invalid.token.here')
        self.assertStatus(401)

    def test_protected_endpoint_with_malformed_header(self):
        """Test that protected endpoints reject malformed auth headers."""
        self.get('/api/users/me', HTTP_AUTHORIZATION='NotBearer sometoken')
        self.assertStatus(401)

    def test_protected_endpoint_with_valid_token(self):
        """Test accessing protected endpoint with valid token."""
        token = self.register_and_login('valid_token@example.com', 'securepassword123', 'Token Test')

        data = self.get('/api/users/me', **self.auth_headers(token))
        self.assertStatus(200)
        self.assertEqual(data['email'], 'valid_token@example.com')

    def test_get_me_returns_user_data(self):
        """Test that /me endpoint returns correct user data."""
        token = self.register_and_login('me_test@example.com', 'password123', 'Me Test')

        data = self.get('/api/users/me', **self.auth_headers(token))
        self.assertStatus(200)
        self.assertEqual(data['email'], 'me_test@example.com')
        self.assertIsNotNone(data['id'])
        self.assertTrue(data['is_active'])


class TestDemoMode(AuthTestCase):
    """Tests for demo mode registration blocking."""

    @override_settings(DEMO_MODE=True)
    def test_register_blocked_in_demo_mode(self):
        """Test that registration is blocked when DEMO_MODE is enabled."""
        self.post(
            '/api/auth/register',
            {
                'email': 'demouser@example.com',
                'password': 'securepassword123',
                'workspace_name': 'Demo Workspace',
                'accepted_terms_version': '1.0',
                'accepted_privacy_version': '1.0',
            },
        )
        self.assertStatus(403)
        self.assertIn('demo mode', self.response.json()['detail'].lower())

    @override_settings(DEMO_MODE=False)
    def test_register_allowed_when_demo_mode_disabled(self):
        """Test that registration works normally when DEMO_MODE is disabled."""
        data = self.post(
            '/api/auth/register',
            {
                'email': 'normaluser@example.com',
                'password': 'securepassword123',
                'workspace_name': 'Normal Workspace',
                'accepted_terms_version': '1.0',
                'accepted_privacy_version': '1.0',
            },
        )
        self.assertStatus(201)
        # Register now returns JWT token for automatic login
        self.assertIn('access_token', data)
        self.assertEqual(data['token_type'], 'bearer')

    @override_settings(DEMO_MODE=True)
    def test_login_still_works_in_demo_mode(self):
        """Test that existing users can still login when demo mode is enabled."""
        with override_settings(DEMO_MODE=False):
            self.register_and_login('existinguser@example.com', 'securepassword123', 'Existing Workspace')

        data = self.post(
            '/api/auth/login',
            {
                'email': 'existinguser@example.com',
                'password': 'securepassword123',
            },
        )
        self.assertStatus(200)
        self.assertIn('access_token', data)


class TestLoginWith2FA(AuthTestCase):
    """Tests for two-step login flow with 2FA enabled."""

    def _enable_2fa(self, user):
        setup = TwoFactorService.setup(user)
        secret = setup['secret_key']
        code = pyotp.TOTP(secret).now()
        TwoFactorService.verify_and_enable(user, code)
        return secret

    def _register_with_2fa(self, email, password='securepassword123', workspace_name='2FA WS'):
        self.register_and_login(email, password, workspace_name)
        user = get_user_model().objects.get(email=email)
        secret = self._enable_2fa(user)
        return user, secret

    def test_login_returns_temp_token_when_2fa_enabled(self):
        self._register_with_2fa('2fa_login@example.com')

        data = self.post(
            '/api/auth/login',
            {'email': '2fa_login@example.com', 'password': 'securepassword123'},
        )
        self.assertStatus(200)
        self.assertTrue(data['requires_2fa'])
        self.assertIsNotNone(data['temp_token'])
        self.assertIsNone(data['access_token'])

    def test_login_returns_jwt_when_2fa_disabled(self):
        self.register_and_login('no2fa@example.com', 'securepassword123', 'No 2FA')

        data = self.post(
            '/api/auth/login',
            {'email': 'no2fa@example.com', 'password': 'securepassword123'},
        )
        self.assertStatus(200)
        self.assertIn('access_token', data)
        self.assertFalse(data.get('requires_2fa', False))

    def test_verify_2fa_with_valid_totp_code(self):
        user, secret = self._register_with_2fa('verify2fa@example.com')

        data = self.post(
            '/api/auth/login',
            {'email': 'verify2fa@example.com', 'password': 'securepassword123'},
        )
        self.assertStatus(200)
        temp_token = data['temp_token']

        code = pyotp.TOTP(secret).now()
        data = self.post(
            '/api/auth/verify-2fa',
            {'temp_token': temp_token, 'code': code},
        )
        self.assertStatus(200)
        self.assertIn('access_token', data)
        self.assertEqual(data['token_type'], 'bearer')

    def test_verify_2fa_with_invalid_code(self):
        self._register_with_2fa('invalid2fa@example.com')

        data = self.post(
            '/api/auth/login',
            {'email': 'invalid2fa@example.com', 'password': 'securepassword123'},
        )
        self.assertStatus(200)
        temp_token = data['temp_token']

        self.post(
            '/api/auth/verify-2fa',
            {'temp_token': temp_token, 'code': '000000'},
        )
        self.assertStatus(401)

    def test_verify_2fa_with_expired_temp_token(self):
        self._register_with_2fa('expired2fa@example.com')

        data = self.post(
            '/api/auth/login',
            {'email': 'expired2fa@example.com', 'password': 'securepassword123'},
        )
        self.assertStatus(200)
        temp_token = data['temp_token']

        future_time = time.time() + 360
        with patch('time.time', return_value=future_time):
            self.post(
                '/api/auth/verify-2fa',
                {'temp_token': temp_token, 'code': '000000'},
            )
        self.assertStatus(401)

    def test_verify_2fa_with_recovery_code(self):
        self.register_and_login('recovery2fa@example.com', 'securepassword123', 'Recovery 2FA')
        user = get_user_model().objects.get(email='recovery2fa@example.com')
        setup = TwoFactorService.setup(user)
        secret = setup['secret_key']
        code = pyotp.TOTP(secret).now()
        result = TwoFactorService.verify_and_enable(user, code)
        recovery_codes = result['recovery_codes']

        data = self.post(
            '/api/auth/login',
            {'email': 'recovery2fa@example.com', 'password': 'securepassword123'},
        )
        self.assertStatus(200)
        temp_token = data['temp_token']

        data = self.post(
            '/api/auth/verify-2fa',
            {'temp_token': temp_token, 'code': recovery_codes[0]},
        )
        self.assertStatus(200)
        self.assertIn('access_token', data)

    def test_verify_2fa_recovery_code_single_use(self):
        self.register_and_login('singleuse@example.com', 'securepassword123', 'Single Use')
        user = get_user_model().objects.get(email='singleuse@example.com')
        setup = TwoFactorService.setup(user)
        code = pyotp.TOTP(setup['secret_key']).now()
        result = TwoFactorService.verify_and_enable(user, code)
        recovery_code = result['recovery_codes'][0]

        data = self.post(
            '/api/auth/login',
            {'email': 'singleuse@example.com', 'password': 'securepassword123'},
        )
        temp_token = data['temp_token']

        self.post(
            '/api/auth/verify-2fa',
            {'temp_token': temp_token, 'code': recovery_code},
        )
        self.assertStatus(200)

        data = self.post(
            '/api/auth/login',
            {'email': 'singleuse@example.com', 'password': 'securepassword123'},
        )
        temp_token = data['temp_token']

        self.post(
            '/api/auth/verify-2fa',
            {'temp_token': temp_token, 'code': recovery_code},
        )
        self.assertStatus(401)

    def test_verify_2fa_rate_limited(self):
        self._register_with_2fa('ratelimit@example.com')

        data = self.post(
            '/api/auth/login',
            {'email': 'ratelimit@example.com', 'password': 'securepassword123'},
        )
        temp_token = data['temp_token']

        for _ in range(10):
            self.post(
                '/api/auth/verify-2fa',
                {'temp_token': temp_token, 'code': '000000'},
            )

        self.post(
            '/api/auth/verify-2fa',
            {'temp_token': temp_token, 'code': '000000'},
        )
        self.assertStatus(429)

    def test_temp_token_cannot_access_protected_endpoints(self):
        self._register_with_2fa('temponly@example.com')

        data = self.post(
            '/api/auth/login',
            {'email': 'temponly@example.com', 'password': 'securepassword123'},
        )
        temp_token = data['temp_token']

        self.get('/api/users/me', HTTP_AUTHORIZATION=f'Bearer {temp_token}')
        self.assertStatus(401)

    def test_verify_2fa_temp_token_single_use(self):
        user, secret = self._register_with_2fa('tokensingleuse@example.com')

        data = self.post(
            '/api/auth/login',
            {'email': 'tokensingleuse@example.com', 'password': 'securepassword123'},
        )
        self.assertStatus(200)
        temp_token = data['temp_token']

        code = pyotp.TOTP(secret).now()
        data = self.post(
            '/api/auth/verify-2fa',
            {'temp_token': temp_token, 'code': code},
        )
        self.assertStatus(200)
        self.assertIn('access_token', data)

        code = pyotp.TOTP(secret).now()
        self.post(
            '/api/auth/verify-2fa',
            {'temp_token': temp_token, 'code': code},
        )
        self.assertStatus(401)
