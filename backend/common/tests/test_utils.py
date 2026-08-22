"""Tests for common utility functions."""

from django.test import RequestFactory, SimpleTestCase, override_settings

from common.utils import get_client_ip


class GetClientIPTests(SimpleTestCase):
    def setUp(self):
        self.factory = RequestFactory()

    def test_returns_remote_addr(self):
        request = self.factory.get('/')
        request.META['REMOTE_ADDR'] = '192.168.1.1'
        self.assertEqual(get_client_ip(request), '192.168.1.1')

    @override_settings(TRUSTED_PROXY_COUNT=0)
    def test_zero_trusted_proxies_ignores_spoofed_xff(self):
        """Default: XFF is client-controlled and must be ignored entirely."""
        request = self.factory.get('/')
        request.META['REMOTE_ADDR'] = '127.0.0.1'
        request.META['HTTP_X_FORWARDED_FOR'] = '1.2.3.4, 5.6.7.8'
        self.assertEqual(get_client_ip(request), '127.0.0.1')

    @override_settings(TRUSTED_PROXY_COUNT=1)
    def test_one_trusted_proxy_takes_last_entry(self):
        """The proxy appends the IP it saw; the client is 1 entry from the right."""
        request = self.factory.get('/')
        request.META['REMOTE_ADDR'] = '127.0.0.1'
        request.META['HTTP_X_FORWARDED_FOR'] = '203.0.113.50, 70.41.3.18'
        self.assertEqual(get_client_ip(request), '70.41.3.18')

    @override_settings(TRUSTED_PROXY_COUNT=2)
    def test_two_trusted_proxies_takes_second_from_last(self):
        request = self.factory.get('/')
        request.META['REMOTE_ADDR'] = '127.0.0.1'
        request.META['HTTP_X_FORWARDED_FOR'] = '1.2.3.4, 203.0.113.50, 70.41.3.18, 10.0.0.5'
        self.assertEqual(get_client_ip(request), '70.41.3.18')

    @override_settings(TRUSTED_PROXY_COUNT=2)
    def test_spoofed_prefix_entries_ignored(self):
        """Client-supplied prefix entries must not influence the derived IP."""
        request = self.factory.get('/')
        request.META['REMOTE_ADDR'] = '127.0.0.1'
        request.META['HTTP_X_FORWARDED_FOR'] = '6.6.6.6, 6.6.6.7, 6.6.6.8, 203.0.113.50, 10.0.0.5'
        self.assertEqual(get_client_ip(request), '203.0.113.50')

    @override_settings(TRUSTED_PROXY_COUNT=1)
    def test_fewer_entries_than_proxy_count_takes_first(self):
        """A single entry was appended by our own trusted proxy — it is the client."""
        request = self.factory.get('/')
        request.META['REMOTE_ADDR'] = '127.0.0.1'
        request.META['HTTP_X_FORWARDED_FOR'] = '10.0.0.1'
        self.assertEqual(get_client_ip(request), '10.0.0.1')

    @override_settings(TRUSTED_PROXY_COUNT=1)
    def test_missing_xff_falls_back_to_remote_addr(self):
        request = self.factory.get('/')
        request.META['REMOTE_ADDR'] = '192.168.1.1'
        self.assertEqual(get_client_ip(request), '192.168.1.1')

    def test_no_headers_returns_none(self):
        request = self.factory.get('/')
        request.META.pop('REMOTE_ADDR', None)
        self.assertIsNone(get_client_ip(request))
