"""Unit tests for the shared pagination helper in core.schemas.pagination."""

from django.test import TestCase

from common.tests.factories import UserFactory
from core.schemas.pagination import DEFAULT_PAGE_SIZE, paginate_queryset
from users.models import User


class TestPaginateQueryset(TestCase):
    """Page-clamping contract of paginate_queryset, independent of any endpoint.

    Assertions are count/meta based because User.objects.all() has no
    Meta.ordering guarantee - only counts and returned page numbers are
    deterministic across runs.
    """

    def test_out_of_range_page_serves_last_valid_page(self):
        """A stale page beyond a shrunken total returns the last page, not an empty one."""
        UserFactory.create_batch(30)

        items, total, page, page_size, total_pages = paginate_queryset(User.objects.all(), page=5, page_size=25)

        self.assertEqual(total, 30)
        self.assertEqual(total_pages, 2)
        self.assertEqual(page, 2)
        self.assertEqual(len(items), 5)

    def test_out_of_range_page_on_single_page_result_serves_page_one(self):
        UserFactory.create_batch(3)

        items, total, page, page_size, total_pages = paginate_queryset(User.objects.all(), page=99, page_size=25)

        self.assertEqual(total, 3)
        self.assertEqual(total_pages, 1)
        self.assertEqual(page, 1)
        self.assertEqual(len(items), 3)

    def test_in_range_page_unchanged(self):
        UserFactory.create_batch(30)

        with self.assertNumQueries(2):  # COUNT + LIMIT/OFFSET slice - never a full load
            items, total, page, page_size, total_pages = paginate_queryset(User.objects.all(), page=2, page_size=25)

        self.assertEqual(page, 2)
        self.assertEqual(len(items), 5)
        self.assertEqual(total, 30)
        self.assertEqual(total_pages, 2)

    def test_page_below_one_clamps_to_first_page(self):
        UserFactory.create_batch(30)

        items, _, page, _, _ = paginate_queryset(User.objects.all(), page=0, page_size=25)

        self.assertEqual(page, 1)
        self.assertEqual(len(items), 25)

    def test_empty_queryset_reports_page_one(self):
        items, total, page, page_size, total_pages = paginate_queryset(User.objects.none(), page=7, page_size=25)

        self.assertEqual(items, [])
        self.assertEqual(total, 0)
        self.assertEqual(page, 1)
        self.assertEqual(total_pages, 0)

    def test_page_size_not_in_allowed_sizes_falls_back_to_default(self):
        UserFactory.create_batch(30)

        _, _, _, page_size, _ = paginate_queryset(User.objects.all(), page=1, page_size=7)

        self.assertEqual(page_size, DEFAULT_PAGE_SIZE)
