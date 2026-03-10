"""Tests for common utility functions."""

from django.test import RequestFactory, SimpleTestCase

from common.utils import get_client_ip


class GetClientIPTests(SimpleTestCase):
    def setUp(self):
        self.factory = RequestFactory()

    def test_returns_remote_addr(self):
        request = self.factory.get('/')
        request.META['REMOTE_ADDR'] = '192.168.1.1'
        self.assertEqual(get_client_ip(request), '192.168.1.1')

    def test_prefers_x_forwarded_for(self):
        request = self.factory.get('/')
        request.META['REMOTE_ADDR'] = '127.0.0.1'
        request.META['HTTP_X_FORWARDED_FOR'] = '203.0.113.50, 70.41.3.18'
        self.assertEqual(get_client_ip(request), '203.0.113.50')

    def test_single_x_forwarded_for(self):
        request = self.factory.get('/')
        request.META['HTTP_X_FORWARDED_FOR'] = '10.0.0.1'
        self.assertEqual(get_client_ip(request), '10.0.0.1')

    def test_no_headers_returns_none(self):
        request = self.factory.get('/')
        request.META.pop('REMOTE_ADDR', None)
        self.assertIsNone(get_client_ip(request))
