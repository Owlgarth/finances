"""Tests for rate limiting and file validation utilities."""

from unittest.mock import MagicMock, call, patch

from django.test import RequestFactory, SimpleTestCase, override_settings
from ninja.errors import HttpError

from common.throttle import rate_limit, rate_limit_account, validate_file_size


class TestRateLimit(SimpleTestCase):
    """Tests for the rate_limit decorator."""

    def setUp(self):
        self.factory = RequestFactory()

    @patch('common.throttle.cache')
    def test_allows_requests_under_limit(self, mock_cache):
        """Requests under the limit should be allowed."""
        mock_cache.add.return_value = False
        mock_cache.incr.return_value = 5

        @rate_limit('test', limit=10, period=60)
        def test_view(request):
            return 'success'

        request = self.factory.get('/')
        request.META['REMOTE_ADDR'] = '127.0.0.1'

        result = test_view(request)
        self.assertEqual(result, 'success')

    @patch('common.throttle.cache')
    def test_allows_first_request(self, mock_cache):
        """First request (cache.add succeeds) should be allowed."""
        mock_cache.add.return_value = True

        @rate_limit('test', limit=10, period=60)
        def test_view(request):
            return 'success'

        request = self.factory.get('/')
        request.META['REMOTE_ADDR'] = '127.0.0.1'

        result = test_view(request)
        self.assertEqual(result, 'success')
        mock_cache.add.assert_called_once_with('ratelimit:test:127.0.0.1', 1, 60)

    @patch('common.throttle.cache')
    def test_blocks_requests_over_limit(self, mock_cache):
        """Requests over the limit should be blocked with 429."""
        mock_cache.add.return_value = False
        mock_cache.incr.return_value = 11

        @rate_limit('test', limit=10, period=60)
        def test_view(request):
            return 'success'

        request = self.factory.get('/')
        request.META['REMOTE_ADDR'] = '127.0.0.1'

        with self.assertRaises(HttpError) as context:
            test_view(request)

        self.assertEqual(context.exception.status_code, 429)
        self.assertIn('Too many requests', str(context.exception))

    @patch('common.throttle.cache')
    def test_allows_request_at_exact_limit(self, mock_cache):
        """Request at exactly the limit should be allowed."""
        mock_cache.add.return_value = False
        mock_cache.incr.return_value = 10

        @rate_limit('test', limit=10, period=60)
        def test_view(request):
            return 'success'

        request = self.factory.get('/')
        request.META['REMOTE_ADDR'] = '127.0.0.1'

        result = test_view(request)
        self.assertEqual(result, 'success')

    @patch('common.throttle.cache')
    def test_handles_incr_value_error_fallback(self, mock_cache):
        """Should fall back to cache.set when incr raises ValueError (key expired)."""
        mock_cache.add.return_value = False
        mock_cache.incr.side_effect = ValueError

        @rate_limit('test', limit=10, period=60)
        def test_view(request):
            return 'success'

        request = self.factory.get('/')
        request.META['REMOTE_ADDR'] = '127.0.0.1'

        result = test_view(request)
        self.assertEqual(result, 'success')
        mock_cache.set.assert_called_once_with('ratelimit:test:127.0.0.1', 1, 60)

    @patch('common.throttle.cache')
    def test_uses_correct_cache_key(self, mock_cache):
        """Cache key should include prefix and IP."""
        mock_cache.add.return_value = True

        @rate_limit('login', limit=10, period=60)
        def test_view(request):
            return 'success'

        request = self.factory.get('/')
        request.META['REMOTE_ADDR'] = '192.168.1.1'

        test_view(request)

        mock_cache.add.assert_called_with('ratelimit:login:192.168.1.1', 1, 60)

    @patch('common.throttle.cache')
    def test_ignores_x_forwarded_for_by_default(self, mock_cache):
        """X-Forwarded-For must be ignored when TRUSTED_PROXY_COUNT=0 (default)."""
        mock_cache.add.return_value = True

        @rate_limit('test', limit=10, period=60)
        def test_view(request):
            return 'success'

        request = self.factory.get('/')
        request.META['HTTP_X_FORWARDED_FOR'] = '10.0.0.1, 192.168.1.1'
        request.META['REMOTE_ADDR'] = '127.0.0.1'

        test_view(request)

        mock_cache.add.assert_called_with('ratelimit:test:127.0.0.1', 1, 60)

    @patch('common.throttle.cache')
    @override_settings(TRUSTED_PROXY_COUNT=1)
    def test_uses_x_forwarded_for_last_entry_behind_one_proxy(self, mock_cache):
        """With one trusted proxy, the client is the last XFF entry (appended by the proxy)."""
        mock_cache.add.return_value = True

        @rate_limit('test', limit=10, period=60)
        def test_view(request):
            return 'success'

        request = self.factory.get('/')
        request.META['HTTP_X_FORWARDED_FOR'] = '10.0.0.1, 192.168.1.1'
        request.META['REMOTE_ADDR'] = '127.0.0.1'

        test_view(request)

        mock_cache.add.assert_called_with('ratelimit:test:192.168.1.1', 1, 60)


class TestRateLimitAccount(SimpleTestCase):
    """Tests for the rate_limit_account decorator."""

    def setUp(self):
        self.factory = RequestFactory()

    @patch('common.throttle.cache')
    def test_cache_key_excludes_ip(self, mock_cache):
        """Cache key must contain prefix and key part only — no client IP."""
        mock_cache.add.return_value = True

        @rate_limit_account('login_account', lambda request: 'user@example.com', limit=5, period=60)
        def test_view(request):
            return 'success'

        request = self.factory.get('/')
        request.META['REMOTE_ADDR'] = '203.0.113.10'

        test_view(request)

        mock_cache.add.assert_called_once_with('ratelimit:login_account:user@example.com', 1, 60)

    @patch('common.throttle.cache')
    def test_limit_enforced_per_key_independent_of_ip(self, mock_cache):
        """Rotating the client IP must not reset the counter for the same key."""
        mock_cache.add.return_value = False
        mock_cache.incr.return_value = 6  # over the limit of 5

        @rate_limit_account('login_account', lambda request: 'user@example.com', limit=5, period=60)
        def test_view(request):
            return 'success'

        for ip in ('203.0.113.10', '198.51.100.7', '192.0.2.99'):
            request = self.factory.get('/')
            request.META['REMOTE_ADDR'] = ip
            with self.assertRaises(HttpError) as context:
                test_view(request)
            self.assertEqual(context.exception.status_code, 429)
            self.assertIn('Too many requests', str(context.exception))

    @patch('common.throttle.cache')
    def test_different_keys_get_independent_counters(self, mock_cache):
        """Separate key parts must not share a bucket."""
        mock_cache.add.return_value = True

        @rate_limit_account('login_account', lambda request: request.META.get('HTTP_X_ACCOUNT'), limit=5, period=60)
        def test_view(request):
            return 'success'

        for account in ('a@example.com', 'b@example.com'):
            request = self.factory.get('/')
            request.META['HTTP_X_ACCOUNT'] = account
            self.assertEqual(test_view(request), 'success')

        mock_cache.add.assert_has_calls(
            [
                call('ratelimit:login_account:a@example.com', 1, 60),
                call('ratelimit:login_account:b@example.com', 1, 60),
            ]
        )


class TestValidateFileSize(SimpleTestCase):
    """Tests for the validate_file_size function."""

    def test_allows_small_file(self):
        """Files under the limit should be allowed."""
        file = MagicMock()
        file.size = 1 * 1024 * 1024  # 1MB

        validate_file_size(file, max_size_mb=5)

    def test_allows_file_at_limit(self):
        """Files exactly at the limit should be allowed."""
        file = MagicMock()
        file.size = 5 * 1024 * 1024  # 5MB

        validate_file_size(file, max_size_mb=5)

    def test_blocks_file_over_limit(self):
        """Files over the limit should be blocked with 400."""
        file = MagicMock()
        file.size = 6 * 1024 * 1024  # 6MB

        with self.assertRaises(HttpError) as context:
            validate_file_size(file, max_size_mb=5)

        self.assertEqual(context.exception.status_code, 400)
        self.assertIn('File too large', str(context.exception))
        self.assertIn('5MB', str(context.exception))

    def test_custom_max_size(self):
        """Should respect custom max size parameter."""
        file = MagicMock()
        file.size = 2 * 1024 * 1024  # 2MB

        with self.assertRaises(HttpError) as context:
            validate_file_size(file, max_size_mb=1)

        self.assertIn('1MB', str(context.exception))
