"""Tests for rate limiting and file validation utilities."""

from unittest.mock import MagicMock, patch

from django.test import RequestFactory, SimpleTestCase
from ninja.errors import HttpError

from common.throttle import rate_limit, validate_file_size


class TestRateLimit(SimpleTestCase):
    """Tests for the rate_limit decorator."""

    def setUp(self):
        self.factory = RequestFactory()

    @patch('common.throttle.cache')
    def test_allows_requests_under_limit(self, mock_cache):
        """Requests under the limit should be allowed."""
        mock_cache.get.return_value = 5  # Under the limit of 10

        @rate_limit('test', limit=10, period=60)
        def test_view(request):
            return 'success'

        request = self.factory.get('/')
        request.META['REMOTE_ADDR'] = '127.0.0.1'

        result = test_view(request)
        self.assertEqual(result, 'success')
        mock_cache.set.assert_called_once()

    @patch('common.throttle.cache')
    def test_blocks_requests_over_limit(self, mock_cache):
        """Requests over the limit should be blocked with 429."""
        mock_cache.get.return_value = 10  # At the limit

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
    def test_uses_correct_cache_key(self, mock_cache):
        """Cache key should include prefix and IP."""
        mock_cache.get.return_value = 0

        @rate_limit('login', limit=10, period=60)
        def test_view(request):
            return 'success'

        request = self.factory.get('/')
        request.META['REMOTE_ADDR'] = '192.168.1.1'

        test_view(request)

        mock_cache.get.assert_called_with('ratelimit:login:192.168.1.1', 0)
        mock_cache.set.assert_called_with('ratelimit:login:192.168.1.1', 1, 60)

    @patch('common.throttle.cache')
    def test_handles_x_forwarded_for_header(self, mock_cache):
        """Should use X-Forwarded-For header when present."""
        mock_cache.get.return_value = 0

        @rate_limit('test', limit=10, period=60)
        def test_view(request):
            return 'success'

        request = self.factory.get('/')
        request.META['HTTP_X_FORWARDED_FOR'] = '10.0.0.1, 192.168.1.1'
        request.META['REMOTE_ADDR'] = '127.0.0.1'

        test_view(request)

        # Should use first IP from X-Forwarded-For
        mock_cache.get.assert_called_with('ratelimit:test:10.0.0.1', 0)


class TestValidateFileSize(SimpleTestCase):
    """Tests for the validate_file_size function."""

    def test_allows_small_file(self):
        """Files under the limit should be allowed."""
        file = MagicMock()
        file.size = 1 * 1024 * 1024  # 1MB

        # Should not raise
        validate_file_size(file, max_size_mb=5)

    def test_allows_file_at_limit(self):
        """Files exactly at the limit should be allowed."""
        file = MagicMock()
        file.size = 5 * 1024 * 1024  # 5MB

        # Should not raise
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
