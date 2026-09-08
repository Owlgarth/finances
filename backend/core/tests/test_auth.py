"""Tests for authentication endpoints."""

import datetime
import time
import uuid
from unittest.mock import patch

import jwt
import pyotp
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import mail
from django.test import override_settings

from common.auth import create_temp_token
from currencies.services import CurrencyCatalogService
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
                'accepted_terms_version': '2.1',
                'accepted_privacy_version': '2.1',
            },
        )
        self.assertStatus(201)
        # Register now returns JWT token for automatic login
        self.assertIn('access_token', data)
        self.assertEqual(data['token_type'], 'bearer')
        self.assertEqual(len(data['access_token'].split('.')), 3)

    def test_register_creates_empty_but_usable_workspace(self):
        """Default registration is empty but usable: Main account, General budget, starters."""
        from accounts.models import Account
        from budgeting.models import Budget as PlanBudget
        from budgeting.models import Period
        from categories.models import Category
        from transactions.models import Transaction
        from workspaces.models import WorkspaceMember

        self.post(
            '/api/auth/register',
            {
                'email': 'workspace_test@example.com',
                'password': 'securepassword123',
                'workspace_name': 'Test Workspace',
                'accepted_terms_version': '2.1',
                'accepted_privacy_version': '2.1',
            },
        )
        self.assertStatus(201)

        user = get_user_model().objects.get(email='workspace_test@example.com')
        workspace = Workspace.objects.get(id=user.current_workspace.id)
        self.assertEqual(workspace.owner, user)

        member = WorkspaceMember.objects.get(workspace=workspace, user=user)
        self.assertEqual(member.role, 'owner')

        # Default account only — no sample records.
        account_names = set(Account.objects.filter(workspace=workspace).values_list('name', flat=True))
        self.assertEqual(account_names, {'Main'})
        self.assertFalse(Transaction.objects.for_workspace(workspace.id).exists())

        # Usable: General budget with starter categories + current period.
        general_budget = PlanBudget.objects.get(workspace=workspace, name='General')
        self.assertEqual(Category.objects.filter(budget=general_budget).count(), 7)
        self.assertTrue(Period.objects.filter(budget=general_budget).exists())

    def test_register_with_sample_data_flag_adds_records(self):
        """start_with_sample_data=True populates the workspace with example records."""
        from accounts.models import Account
        from planned_transactions.models import PlannedTransaction
        from transactions.models import Transaction
        from transfers.models import Transfer

        self.post(
            '/api/auth/register',
            {
                'email': 'demo_fixtures@example.com',
                'password': 'securepassword123',
                'full_name': 'Demo User',
                'workspace_name': 'Demo Workspace',
                'start_with_sample_data': True,
                'accepted_terms_version': '2.1',
                'accepted_privacy_version': '2.1',
            },
        )
        self.assertStatus(201)

        user = get_user_model().objects.get(email='demo_fixtures@example.com')
        ws_id = user.current_workspace_id

        self.assertTrue(Account.objects.filter(workspace_id=ws_id, name='Main').exists())
        self.assertTrue(Account.objects.filter(workspace_id=ws_id, name='Savings').exists())

        transactions = Transaction.objects.for_workspace(ws_id)
        self.assertGreaterEqual(transactions.count(), 10)
        self.assertGreaterEqual(transactions.filter(type='income').count(), 2)
        self.assertGreaterEqual(transactions.filter(type='expense').count(), 8)

        self.assertGreaterEqual(PlannedTransaction.objects.for_workspace(ws_id).count(), 3)
        self.assertTrue(Transfer.objects.for_workspace(ws_id).exists())

    @patch('core.services.time.sleep')
    def test_register_duplicate_email(self, mock_sleep):
        """Duplicate-email registration returns a generic error, notifies the owner, creates nothing."""
        self.post(
            '/api/auth/register',
            {
                'email': 'duplicate@example.com',
                'password': 'securepassword123',
                'workspace_name': 'Workspace 1',
                'accepted_terms_version': '2.1',
                'accepted_privacy_version': '2.1',
            },
        )
        self.assertStatus(201)
        workspace_count = Workspace.objects.count()

        data = self.post(
            '/api/auth/register',
            {
                'email': 'duplicate@example.com',
                'password': 'securepassword123',
                'workspace_name': 'Workspace 2',
                'accepted_terms_version': '2.1',
                'accepted_privacy_version': '2.1',
            },
        )
        self.assertStatus(400)
        error = data['error']
        self.assertEqual(error, 'Unable to register with this email address.')
        self.assertNotIn('already exists', error.lower())

        # The existing address owner is notified (the 201 path's on_commit emails
        # never fire under TestCase, so this is the only outbox entry).
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['duplicate@example.com'])

        # Nothing was created for the rejected attempt.
        self.assertEqual(Workspace.objects.count(), workspace_count)

    @patch('core.services.time.sleep')
    def test_register_existing_email_sends_notification_email(self, mock_sleep):
        """Probing a registered email notifies the account owner, not the requester."""
        self.create_user(email='taken@example.com', full_name='Taken User')

        self.post(
            '/api/auth/register',
            {
                'email': 'taken@example.com',
                'password': 'securepassword123',
                'workspace_name': 'Not Yours',
                'accepted_terms_version': '2.1',
                'accepted_privacy_version': '2.1',
            },
        )
        self.assertStatus(400)

        self.assertEqual(len(mail.outbox), 1)
        email = mail.outbox[0]
        self.assertEqual(email.to, ['taken@example.com'])
        self.assertEqual(email.subject, 'Registration attempt with your email — Owlgarth Finances')
        self.assertIn('Taken User', email.body)

    def test_register_rate_limited_per_email(self):
        """Repeated register attempts against one email hit the account-keyed limit (429)."""
        self.create_user(email='flooded@example.com')
        payload = {
            'email': 'flooded@example.com',
            'password': 'securepassword123',
            'workspace_name': 'Flood',
            'accepted_terms_version': '2.1',
            'accepted_privacy_version': '2.1',
        }
        for _ in range(settings.RATE_LIMIT_REGISTER_ACCOUNT):
            self.post('/api/auth/register', payload)
            self.assertStatus(400)
        self.post('/api/auth/register', payload)
        self.assertStatus(429)

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

    def test_register_with_currency_codes_enables_them_in_order(self):
        """An explicit currency_codes list is enabled verbatim, in the given order."""
        self.post(
            '/api/auth/register',
            {
                'email': 'multi_currency@example.com',
                'password': 'securepassword123',
                'workspace_name': 'Multi Workspace',
                'currency_codes': ['PLN', 'EUR', 'USD'],
                'accepted_terms_version': '2.1',
                'accepted_privacy_version': '2.1',
            },
        )
        self.assertStatus(201)

        user = get_user_model().objects.get(email='multi_currency@example.com')
        enabled = CurrencyCatalogService.list_enabled(user.current_workspace_id)
        # First entry is the primary by construction.
        self.assertEqual([c.code for c in enabled], ['PLN', 'EUR', 'USD'])

    def test_register_currency_codes_first_is_primary(self):
        """The first code is the primary: the seeded Main account books in it."""
        from accounts.models import Account

        self.post(
            '/api/auth/register',
            {
                'email': 'dollar_first@example.com',
                'password': 'securepassword123',
                'workspace_name': 'Dollar First',
                'currency_codes': ['USD', 'PLN'],
                'accepted_terms_version': '2.1',
                'accepted_privacy_version': '2.1',
            },
        )
        self.assertStatus(201)

        user = get_user_model().objects.get(email='dollar_first@example.com')
        enabled = CurrencyCatalogService.list_enabled(user.current_workspace_id)
        self.assertEqual([c.code for c in enabled], ['USD', 'PLN'])

        main = Account.objects.filter(workspace_id=user.current_workspace_id, name='Main').first()
        self.assertIsNotNone(main)
        self.assertEqual(main.currency.code, 'USD')

    def test_register_without_currency_codes_uses_defaults(self):
        """Omitting currency_codes keeps the legacy default: PLN primary + silent extras."""
        self.post(
            '/api/auth/register',
            {
                'email': 'default_currency@example.com',
                'password': 'securepassword123',
                'workspace_name': 'Default Workspace',
                'accepted_terms_version': '2.1',
                'accepted_privacy_version': '2.1',
            },
        )
        self.assertStatus(201)

        user = get_user_model().objects.get(email='default_currency@example.com')
        enabled = CurrencyCatalogService.list_enabled(user.current_workspace_id)
        self.assertEqual([c.code for c in enabled], ['PLN', 'EUR', 'USD'])

    def test_register_currency_codes_cap_returns_422(self):
        """21 pattern-valid codes exceed max_length=20; 422 fires at schema validation."""
        codes = ['ZZ' + chr(ord('A') + idx) for idx in range(21)]
        self.post(
            '/api/auth/register',
            {
                'email': 'too_many_codes@example.com',
                'password': 'securepassword123',
                'workspace_name': 'Big Workspace',
                'currency_codes': codes,
                'accepted_terms_version': '2.1',
                'accepted_privacy_version': '2.1',
            },
        )
        self.assertStatus(422)

    def test_register_currency_codes_empty_returns_422(self):
        """An empty currency_codes list is invalid input (min_length=1), not 'use defaults'."""
        self.post(
            '/api/auth/register',
            {
                'email': 'empty_codes@example.com',
                'password': 'securepassword123',
                'workspace_name': 'Empty Workspace',
                'currency_codes': [],
                'accepted_terms_version': '2.1',
                'accepted_privacy_version': '2.1',
            },
        )
        self.assertStatus(422)

    def test_register_unknown_currency_code_rejected(self):
        """An unknown code inside an explicit list fails with the catalog's 404 + code."""
        data = self.post(
            '/api/auth/register',
            {
                'email': 'unknown_code@example.com',
                'password': 'securepassword123',
                'workspace_name': 'Bad Workspace',
                'currency_codes': ['PLN', 'XXX'],
                'accepted_terms_version': '2.1',
                'accepted_privacy_version': '2.1',
            },
        )
        self.assertStatus(404)
        self.assertEqual(data['code'], 'unknown_currency')


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

    def test_login_rate_limited_per_account_across_ips(self):
        """11th login attempt for the same email is 429 even with a different IP per request.

        Uses create_user (not register_and_login) so no earlier login request
        pre-increments the per-account counter.
        """
        self.create_user('account_throttle@example.com', 'securepassword123')

        for i in range(10):
            self.post(
                '/api/auth/login',
                {'email': 'account_throttle@example.com', 'password': 'wrongpassword'},
                REMOTE_ADDR=f'10.0.0.{i + 1}',
            )
            self.assertStatus(401)

        self.post(
            '/api/auth/login',
            {'email': 'account_throttle@example.com', 'password': 'wrongpassword'},
            REMOTE_ADDR='10.0.0.11',
        )
        self.assertStatus(429)

    def test_login_rate_limit_per_account_not_global(self):
        """11 attempts spread over 10 different emails never hit the per-account cap.

        Every request uses a distinct REMOTE_ADDR so the IP-keyed limit cannot
        fire either — proving the account limit buckets per email, not globally.
        """
        emails = [f'no_interference_{i}@example.com' for i in range(10)]
        for email in emails:
            self.create_user(email, 'securepassword123')

        for i in range(11):
            # The 11th request reuses the first email — still only 2 attempts for it.
            self.post(
                '/api/auth/login',
                {'email': emails[i % 10], 'password': 'wrongpassword'},
                REMOTE_ADDR=f'192.168.0.{i + 1}',
            )
            self.assertStatus(401)

    def test_login_nonexistent_user_same_body_as_wrong_password(self):
        """The no-user path (dummy-hash timing normalization) returns the same 401 body as wrong-password."""
        self.create_user('real_user@example.com', 'securepassword123')

        self.post(
            '/api/auth/login',
            {'email': 'real_user@example.com', 'password': 'wrongpassword'},
        )
        self.assertStatus(401)
        wrong_password_body = self.response.json()

        self.post(
            '/api/auth/login',
            {'email': 'ghost_user@example.com', 'password': 'anypassword'},
        )
        self.assertStatus(401)
        self.assertEqual(self.response.json(), wrong_password_body)


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
                'accepted_terms_version': '2.1',
                'accepted_privacy_version': '2.1',
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
                'accepted_terms_version': '2.1',
                'accepted_privacy_version': '2.1',
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
        user, _secret = self._register_with_2fa('expired2fa@example.com')

        # PyJWT reads the clock inside jwt.decode, not time.time, so a time patch
        # never exercises expiry - mint a 2fa_pending token with a past exp instead.
        now = datetime.datetime.now(datetime.timezone.utc)
        payload = {
            'user_id': str(user.id),
            'type': '2fa_pending',
            'jti': str(uuid.uuid4()),
            'iat': (now - datetime.timedelta(minutes=10)).timestamp(),
            'exp': (now - datetime.timedelta(minutes=5)).timestamp(),
        }
        expired_temp_token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

        self.post('/api/auth/verify-2fa', {'temp_token': expired_temp_token, 'code': '000000'})
        self.assertStatus(401)
        # 'verification token' distinguishes the temp-token branch from the
        # invalid-code branch's 'Invalid verification code' - same status, different cause.
        self.assertIn('verification token', self.response.json()['detail'].lower())

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

    def test_verify_2fa_per_user_limit_independent_of_ip(self):
        """The per-user 2FA bucket spans IPs: 10 attempts from 10 different
        client IPs still block the 11th (IP rotation must not bypass it)."""
        user, secret = self._register_with_2fa('ratelimituser@example.com')

        for i in range(10):
            temp_token = create_temp_token(user)  # fresh single-use token per attempt
            self.post(
                '/api/auth/verify-2fa',
                {'temp_token': temp_token, 'code': '000000'},
                REMOTE_ADDR=f'10.0.0.{i}',
            )
            self.assertStatus(401)  # wrong code, but NOT blocked by any throttle

        self.post(
            '/api/auth/verify-2fa',
            {'temp_token': create_temp_token(user), 'code': '000000'},
            REMOTE_ADDR='10.0.0.10',
        )
        self.assertStatus(429)

    def test_verify_2fa_invalid_tokens_do_not_share_user_bucket(self):
        """Invalid temp tokens get a random UUID key each, so they never
        accumulate into a shared per-user bucket (12 > limit 10, still no 429)."""
        for _ in range(12):
            self.post(
                '/api/auth/verify-2fa',
                {'temp_token': 'not-a-real-token', 'code': '000000'},
            )
            self.assertStatus(401)

    def test_verify_2fa_succeeds_at_exact_per_user_limit(self):
        """9 wrong codes then the correct code on the 10th attempt still
        succeeds — the lockout must not lock out a legitimate user at the cap."""
        user, secret = self._register_with_2fa('ratelimitedge@example.com')

        for _ in range(9):
            self.post(
                '/api/auth/verify-2fa',
                {'temp_token': create_temp_token(user), 'code': '000000'},
            )
            self.assertStatus(401)

        data = self.post(
            '/api/auth/verify-2fa',
            {'temp_token': create_temp_token(user), 'code': pyotp.TOTP(secret).now()},
        )
        self.assertStatus(200)
        self.assertIn('access_token', data)

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


class TestRefreshToken(AuthTestCase):
    """Tests for refresh token flow — creation, rotation, expiry, replay prevention."""

    def _register_and_get_refresh_token(self, email='refresh@example.com', password='securepassword123'):
        self.post(
            '/api/auth/register',
            {
                'email': email,
                'password': password,
                'workspace_name': 'Refresh WS',
                'accepted_terms_version': '2.1',
                'accepted_privacy_version': '2.1',
            },
        )
        self.assertStatus(201)
        data = self.post('/api/auth/login', {'email': email, 'password': password})
        self.assertStatus(200)
        return data['refresh_token']

    def test_successful_refresh(self):
        refresh_token = self._register_and_get_refresh_token('refresh_success@example.com')

        data = self.post('/api/auth/refresh', {'refresh_token': refresh_token})
        self.assertStatus(200)
        self.assertIn('access_token', data)
        self.assertIn('refresh_token', data)
        self.assertEqual(data['token_type'], 'bearer')
        self.assertEqual(len(data['access_token'].split('.')), 3)
        self.assertEqual(len(data['refresh_token'].split('.')), 3)

    def test_token_rotation(self):
        refresh_token = self._register_and_get_refresh_token('rotation@example.com')

        data = self.post('/api/auth/refresh', {'refresh_token': refresh_token})
        self.assertStatus(200)
        new_refresh_token = data['refresh_token']
        self.assertNotEqual(refresh_token, new_refresh_token)

        self.post('/api/auth/refresh', {'refresh_token': refresh_token})
        self.assertStatus(401)

    def test_expired_refresh_token(self):
        import datetime as dt

        import jwt
        from django.conf import settings

        user = get_user_model().objects.filter(email='expired_refresh@example.com').first()
        if not user:
            self.register_and_login('expired_refresh@example.com', 'securepassword123', 'Expired WS')
            user = get_user_model().objects.get(email='expired_refresh@example.com')

        now = dt.datetime.now(dt.timezone.utc)
        payload = {
            'user_id': str(user.id),
            'type': 'refresh',
            'jti': str(__import__('uuid').uuid4()),
            'iat': (now - dt.timedelta(days=8)).timestamp(),
            'exp': (now - dt.timedelta(days=1)).timestamp(),
        }
        expired_token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

        self.post('/api/auth/refresh', {'refresh_token': expired_token})
        self.assertStatus(401)

    def test_invalid_refresh_token(self):
        self.post('/api/auth/refresh', {'refresh_token': 'garbage.token.here'})
        self.assertStatus(401)

    def test_access_token_used_as_refresh_token(self):
        access_token = self.register_and_login('access_as_refresh@example.com', 'securepassword123', 'Test WS')

        self.post('/api/auth/refresh', {'refresh_token': access_token})
        self.assertStatus(401)

    def test_refresh_token_used_as_access_token(self):
        refresh_token = self._register_and_get_refresh_token('refresh_as_access@example.com')

        self.get('/api/users/me', HTTP_AUTHORIZATION=f'Bearer {refresh_token}')
        self.assertStatus(401)

    def test_register_returns_refresh_token(self):
        data = self.post(
            '/api/auth/register',
            {
                'email': 'register_refresh@example.com',
                'password': 'securepassword123',
                'workspace_name': 'Register WS',
                'accepted_terms_version': '2.1',
                'accepted_privacy_version': '2.1',
            },
        )
        self.assertStatus(201)
        self.assertIn('refresh_token', data)
        self.assertIsNotNone(data['refresh_token'])

    def test_2fa_flow_returns_refresh_token(self):
        self.register_and_login('2fa_refresh@example.com', 'securepassword123', '2FA Refresh WS')
        user = get_user_model().objects.get(email='2fa_refresh@example.com')
        setup = TwoFactorService.setup(user)
        code = pyotp.TOTP(setup['secret_key']).now()
        TwoFactorService.verify_and_enable(user, code)

        data = self.post(
            '/api/auth/login',
            {'email': '2fa_refresh@example.com', 'password': 'securepassword123'},
        )
        temp_token = data['temp_token']

        code = pyotp.TOTP(setup['secret_key']).now()
        data = self.post('/api/auth/verify-2fa', {'temp_token': temp_token, 'code': code})
        self.assertStatus(200)
        self.assertIn('refresh_token', data)
        self.assertIsNotNone(data['refresh_token'])

    def test_inactive_user_cannot_refresh(self):
        refresh_token = self._register_and_get_refresh_token('inactive_refresh@example.com')

        user = get_user_model().objects.get(email='inactive_refresh@example.com')
        user.is_active = False
        user.save()

        self.post('/api/auth/refresh', {'refresh_token': refresh_token})
        self.assertStatus(401)

    def test_refresh_token_invalidated_by_password_change(self):
        refresh_token = self._register_and_get_refresh_token('stale_refresh@example.com')

        access_token = self.post(
            '/api/auth/login',
            {'email': 'stale_refresh@example.com', 'password': 'securepassword123'},
        )['access_token']

        self.put(
            '/api/users/me/password',
            {'current_password': 'securepassword123', 'new_password': 'newsecurepassword456'},
            **self.auth_headers(access_token),
        )
        self.assertStatus(200)

        # Refresh token issued BEFORE the change must now be rejected
        self.post('/api/auth/refresh', {'refresh_token': refresh_token})
        self.assertStatus(401)

        # A fresh login yields a refresh token that still works
        data = self.post(
            '/api/auth/login',
            {'email': 'stale_refresh@example.com', 'password': 'newsecurepassword456'},
        )
        self.assertStatus(200)
        data = self.post('/api/auth/refresh', {'refresh_token': data['refresh_token']})
        self.assertStatus(200)
        self.assertIn('access_token', data)

    def test_refresh_token_issued_after_password_change_works(self):
        self._register_and_get_refresh_token('fresh_refresh@example.com')

        access_token = self.post(
            '/api/auth/login',
            {'email': 'fresh_refresh@example.com', 'password': 'securepassword123'},
        )['access_token']
        self.put(
            '/api/users/me/password',
            {'current_password': 'securepassword123', 'new_password': 'newsecurepassword456'},
            **self.auth_headers(access_token),
        )
        self.assertStatus(200)

        time.sleep(0.01)  # ensure iat is strictly after password_changed_at

        data = self.post(
            '/api/auth/login',
            {'email': 'fresh_refresh@example.com', 'password': 'newsecurepassword456'},
        )
        self.assertStatus(200)

        data = self.post('/api/auth/refresh', {'refresh_token': data['refresh_token']})
        self.assertStatus(200)
        self.assertIn('access_token', data)

    def test_new_access_token_is_valid(self):
        refresh_token = self._register_and_get_refresh_token('valid_refresh@example.com')

        data = self.post('/api/auth/refresh', {'refresh_token': refresh_token})
        self.assertStatus(200)
        new_access_token = data['access_token']

        data = self.get('/api/users/me', **self.auth_headers(new_access_token))
        self.assertStatus(200)
        self.assertEqual(data['email'], 'valid_refresh@example.com')
