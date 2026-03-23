"""Tests for legal document templates and API endpoints."""

from django.core.management import call_command
from django.test import SimpleTestCase, TestCase, override_settings
from ninja.errors import HttpError

from common.tests.mixins import APIClientMixin
from core.factories import LegalDocumentFactory
from core.legal import _get_legal_context, get_privacy, get_terms, render_from_template
from core.models import LegalDocument


class LegalTemplateTests(SimpleTestCase):
    """Tests for legal document template rendering (no database required)."""

    def test_default_context_uses_settings(self):
        """Context should be built from Django settings."""
        with override_settings(
            LEGAL_OPERATOR_NAME='Test Company',
            LEGAL_OPERATOR_TYPE='company',
            LEGAL_CONTACT_EMAIL='test@example.com',
            LEGAL_CONTACT_ADDRESS='123 Test St',
            LEGAL_JURISDICTION='Test Jurisdiction',
        ):
            ctx = _get_legal_context()
            self.assertEqual(ctx['operator_name'], 'Test Company')
            self.assertEqual(ctx['operator_type'], 'company')
            self.assertEqual(ctx['contact_email'], 'test@example.com')
            self.assertEqual(ctx['contact_address'], '123 Test St')
            self.assertEqual(ctx['jurisdiction'], 'Test Jurisdiction')
            self.assertFalse(ctx['is_individual'])
            self.assertTrue(ctx['is_company'])

    def test_context_for_individual_operator(self):
        """Context should correctly identify individual operators."""
        with override_settings(
            LEGAL_OPERATOR_NAME='John Doe',
            LEGAL_OPERATOR_TYPE='individual',
        ):
            ctx = _get_legal_context()
            self.assertTrue(ctx['is_individual'])
            self.assertFalse(ctx['is_company'])

    def test_terms_template_renders_all_variables(self):
        """Terms of Service should render all template variables."""
        with override_settings(
            LEGAL_OPERATOR_NAME='Acme Corp',
            LEGAL_OPERATOR_TYPE='company',
            LEGAL_CONTACT_EMAIL='legal@acme.com',
            LEGAL_CONTACT_ADDRESS='123 Business Ave',
            LEGAL_JURISDICTION='California, USA',
        ):
            terms = render_from_template('legal/terms-of-service.md')
            content = terms['content']

            self.assertIn('Acme Corp', content)
            self.assertIn('legal@acme.com', content)
            self.assertIn('123 Business Ave', content)
            self.assertIn('California, USA', content)
            self.assertNotIn('(an individual)', content)

    def test_privacy_template_renders_all_variables(self):
        """Privacy Policy should render all template variables."""
        with override_settings(
            LEGAL_OPERATOR_NAME='Jane Smith',
            LEGAL_OPERATOR_TYPE='individual',
            LEGAL_CONTACT_EMAIL='jane@example.com',
            LEGAL_CONTACT_ADDRESS='456 Personal St',
        ):
            privacy = render_from_template('legal/privacy-policy.md')
            content = privacy['content']

            self.assertIn('Jane Smith', content)
            self.assertIn('jane@example.com', content)
            self.assertIn('456 Personal St', content)
            self.assertIn('(an individual)', content)

    def test_terms_includes_version_and_date(self):
        """Terms of Service should include version and effective date from frontmatter."""
        terms = render_from_template('legal/terms-of-service.md')

        self.assertIn('version', terms)
        self.assertIn('effective_date', terms)
        self.assertIsNotNone(terms['version'])
        self.assertIsNotNone(terms['effective_date'])
        self.assertRegex(terms['version'], r'^\d+\.\d+$')

    def test_privacy_includes_version_and_date(self):
        """Privacy Policy should include version and effective date from frontmatter."""
        privacy = render_from_template('legal/privacy-policy.md')

        self.assertIn('version', privacy)
        self.assertIn('effective_date', privacy)
        self.assertIsNotNone(privacy['version'])
        self.assertIsNotNone(privacy['effective_date'])
        self.assertRegex(privacy['version'], r'^\d+\.\d+$')

    def test_terms_template_without_address(self):
        """Terms of Service should omit address section if not provided."""
        with override_settings(
            LEGAL_OPERATOR_NAME='Simple Corp',
            LEGAL_CONTACT_ADDRESS='',
        ):
            terms = render_from_template('legal/terms-of-service.md')
            content = terms['content']

            self.assertIn('Simple Corp', content)

    def test_privacy_template_without_address(self):
        """Privacy Policy should omit address section if not provided."""
        with override_settings(
            LEGAL_OPERATOR_NAME='Simple Person',
            LEGAL_OPERATOR_TYPE='individual',
            LEGAL_CONTACT_ADDRESS='',
        ):
            privacy = render_from_template('legal/privacy-policy.md')
            content = privacy['content']

            self.assertIn('Simple Person', content)

    def test_templates_contain_required_sections(self):
        """Legal documents should contain all required GDPR sections."""
        terms = render_from_template('legal/terms-of-service.md')
        privacy = render_from_template('legal/privacy-policy.md')

        self.assertIn('Acceptance of Terms', terms['content'])
        self.assertIn('Data & Privacy', terms['content'])
        self.assertIn('Account Termination', terms['content'])
        self.assertIn('Governing Law', terms['content'])

        self.assertIn('Data We Collect', privacy['content'])
        self.assertIn('Legal Basis', privacy['content'])
        self.assertIn('Your Rights', privacy['content'])
        self.assertIn('Data Security', privacy['content'])

    def test_templates_contain_no_unrendered_variables(self):
        """Rendered templates should not contain Django template syntax."""
        with override_settings(
            LEGAL_OPERATOR_NAME='Test Operator',
            LEGAL_OPERATOR_TYPE='company',
            LEGAL_CONTACT_EMAIL='test@test.com',
            LEGAL_JURISDICTION='Test',
        ):
            terms = render_from_template('legal/terms-of-service.md')
            privacy = render_from_template('legal/privacy-policy.md')

            self.assertNotIn('{{', terms['content'])
            self.assertNotIn('}}', terms['content'])
            self.assertNotIn('{%', terms['content'])
            self.assertNotIn('%}', terms['content'])

            self.assertNotIn('{{', privacy['content'])
            self.assertNotIn('}}', privacy['content'])
            self.assertNotIn('{%', privacy['content'])
            self.assertNotIn('%}', privacy['content'])


class LegalDBTests(TestCase):
    """Tests for legal document database reads."""

    def setUp(self):
        LegalDocument.objects.all().delete()
        LegalDocumentFactory(
            doc_type='terms_of_service',
            version='9.9',
            effective_date='2099-01-01',
            content='Custom terms content',
            is_active=True,
        )
        LegalDocumentFactory(
            doc_type='privacy_policy',
            version='9.9',
            effective_date='2099-01-01',
            content='Custom privacy content',
            is_active=True,
        )

    def test_get_terms_returns_db_content(self):
        result = get_terms()
        self.assertEqual(result['content'], 'Custom terms content')
        self.assertEqual(result['version'], '9.9')

    def test_get_privacy_returns_db_content(self):
        result = get_privacy()
        self.assertEqual(result['content'], 'Custom privacy content')

    def test_raises_if_no_active_document(self):
        LegalDocument.objects.filter(doc_type='terms_of_service').update(is_active=False)
        with self.assertRaises(HttpError) as ctx:
            get_terms()
        self.assertEqual(ctx.exception.status_code, 503)


class LegalAPITests(APIClientMixin, TestCase):
    """Tests for legal document API endpoints."""

    def setUp(self):
        LegalDocument.objects.all().delete()
        LegalDocumentFactory(
            doc_type='terms_of_service',
            version='1.0',
            effective_date='2024-01-01',
            content='Terms content from database',
            is_active=True,
        )
        LegalDocumentFactory(
            doc_type='privacy_policy',
            version='1.0',
            effective_date='2024-01-01',
            content='Privacy content from database',
            is_active=True,
        )

    def test_get_terms_endpoint(self):
        """GET /api/legal/terms should return terms with version and content."""
        response = self.client.get('/api/legal/terms')

        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertIn('version', data)
        self.assertIn('effective_date', data)
        self.assertIn('content', data)
        self.assertIsInstance(data['content'], str)
        self.assertGreater(len(data['content']), 10)

    def test_get_privacy_endpoint(self):
        """GET /api/legal/privacy should return privacy policy with version and content."""
        response = self.client.get('/api/legal/privacy')

        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertIn('version', data)
        self.assertIn('effective_date', data)
        self.assertIn('content', data)
        self.assertIsInstance(data['content'], str)
        self.assertGreater(len(data['content']), 10)

    def test_legal_endpoints_are_public(self):
        """Legal document endpoints should not require authentication."""
        response_terms = self.client.get('/api/legal/terms')
        response_privacy = self.client.get('/api/legal/privacy')

        self.assertEqual(response_terms.status_code, 200)
        self.assertEqual(response_privacy.status_code, 200)

    def test_terms_content_matches_db(self):
        """Terms API should return content from database."""
        response = self.client.get('/api/legal/terms')
        data = response.json()

        self.assertEqual(data['content'], 'Terms content from database')
        self.assertEqual(data['version'], '1.0')

    def test_privacy_content_matches_db(self):
        """Privacy API should return content from database."""
        response = self.client.get('/api/legal/privacy')
        data = response.json()

        self.assertEqual(data['content'], 'Privacy content from database')


class SeedLegalDocumentsTests(TestCase):
    """Tests for the seed_legal_documents management command."""

    def test_seed_creates_active_documents(self):
        """Seed command should create active legal documents from templates."""
        call_command('seed_legal_documents')

        terms = LegalDocument.objects.get(doc_type='terms_of_service', is_active=True)
        privacy = LegalDocument.objects.get(doc_type='privacy_policy', is_active=True)

        self.assertIsNotNone(terms)
        self.assertIsNotNone(privacy)
        self.assertGreater(len(terms.content), 100)
        self.assertGreater(len(privacy.content), 100)

    def test_seed_is_idempotent(self):
        """Running seed multiple times should not create duplicates."""
        call_command('seed_legal_documents')
        call_command('seed_legal_documents')

        active_terms = LegalDocument.objects.filter(doc_type='terms_of_service', is_active=True).count()
        active_privacy = LegalDocument.objects.filter(doc_type='privacy_policy', is_active=True).count()

        self.assertEqual(active_terms, 1)
        self.assertEqual(active_privacy, 1)

    def test_seed_force_updates_existing(self):
        """Seed with --force should update existing active documents."""
        call_command('seed_legal_documents')

        LegalDocument.objects.filter(is_active=True).update(content='Old content')

        call_command('seed_legal_documents', force=True)

        terms = LegalDocument.objects.get(doc_type='terms_of_service', is_active=True)
        self.assertNotEqual(terms.content, 'Old content')
