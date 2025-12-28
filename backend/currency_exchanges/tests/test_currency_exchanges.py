"""Tests for currency_exchanges API endpoints."""

from datetime import date
from decimal import Decimal

# Import User model at module level for use in tests
from django.contrib.auth import get_user_model
from django.test import TestCase

from budget_accounts.models import BudgetAccount
from budget_periods.models import BudgetPeriod
from common.tests.mixins import APIClientMixin, AuthMixin
from currency_exchanges.models import CurrencyExchange
from period_balances.models import PeriodBalance
from workspaces.models import Workspace, WorkspaceMember

User = get_user_model()


# =============================================================================
# Base Test Class
# =============================================================================


class CurrencyExchangeTestCase(APIClientMixin, AuthMixin, TestCase):
    """Base test case for currency exchange tests with authenticated user and data."""

    def setUp(self):
        """Set up test data for currency exchange API tests."""
        APIClientMixin.setUp(self)
        AuthMixin.setUp(self)

        # Get or create the general budget account
        self.account = BudgetAccount.objects.filter(workspace=self.workspace, name='General').first()

        # Create budget periods
        self.period1 = BudgetPeriod.objects.create(
            budget_account=self.account,
            name='January 2025',
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 31),
            weeks=5,
            created_by=self.user,
        )

        self.period2 = BudgetPeriod.objects.create(
            budget_account=self.account,
            name='February 2025',
            start_date=date(2025, 2, 1),
            end_date=date(2025, 2, 28),
            weeks=4,
            created_by=self.user,
        )

        # Create period balances for testing
        PeriodBalance.objects.create(
            budget_period=self.period1,
            currency='USD',
            opening_balance=Decimal('1000.00'),
            total_income=0,
            total_expenses=0,
            exchanges_in=0,
            exchanges_out=0,
            closing_balance=Decimal('1000.00'),
        )
        PeriodBalance.objects.create(
            budget_period=self.period1,
            currency='EUR',
            opening_balance=Decimal('500.00'),
            total_income=0,
            total_expenses=0,
            exchanges_in=0,
            exchanges_out=0,
            closing_balance=Decimal('500.00'),
        )

        # Create some test currency exchanges
        self.exchange1 = CurrencyExchange.objects.create(
            budget_period=self.period1,
            date=date(2025, 1, 15),
            description='USD to EUR exchange',
            from_currency='USD',
            from_amount=Decimal('100.00'),
            to_currency='EUR',
            to_amount=Decimal('92.00'),
            exchange_rate=Decimal('0.92'),
            created_by=self.user,
            updated_by=self.user,
        )

        self.exchange2 = CurrencyExchange.objects.create(
            budget_period=self.period1,
            date=date(2025, 1, 20),
            description='EUR to USD exchange',
            from_currency='EUR',
            from_amount=Decimal('50.00'),
            to_currency='USD',
            to_amount=Decimal('54.50'),
            exchange_rate=Decimal('1.09'),
            created_by=self.user,
            updated_by=self.user,
        )

        self.exchange3 = CurrencyExchange.objects.create(
            budget_period=self.period2,
            date=date(2025, 2, 10),
            description='USD to PLN exchange',
            from_currency='USD',
            from_amount=Decimal('200.00'),
            to_currency='PLN',
            to_amount=Decimal('800.00'),
            exchange_rate=Decimal('4.00'),
            created_by=self.user,
            updated_by=self.user,
        )


# =============================================================================
# List Currency Exchanges Tests
# =============================================================================


class TestListCurrencyExchanges(CurrencyExchangeTestCase):
    """Tests for GET /backend/currency-exchanges."""

    def test_list_returns_all_exchanges_in_workspace(self):
        """Test listing all exchanges in the workspace."""
        data = self.get('/backend/currency-exchanges', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data), 3)  # All 3 exchanges created in setUp

    def test_list_filtered_by_period(self):
        """Test listing exchanges filtered by budget period."""
        data = self.get(f'/backend/currency-exchanges?budget_period_id={self.period1.id}', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data), 2)  # Only exchanges in period1

        data = self.get(f'/backend/currency-exchanges?budget_period_id={self.period2.id}', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(len(data), 1)  # Only exchange in period2

    def test_list_ordered_by_date_desc(self):
        """Test that exchanges are ordered by date descending."""
        # Create another exchange with earlier date
        CurrencyExchange.objects.create(
            budget_period=self.period1,
            date=date(2025, 1, 5),
            from_currency='USD',
            from_amount=Decimal('10.00'),
            to_currency='EUR',
            to_amount=Decimal('9.00'),
            created_by=self.user,
            updated_by=self.user,
        )

        data = self.get('/backend/currency-exchanges', **self.auth_headers())
        self.assertStatus(200)
        # Check dates are in descending order
        dates = [exchange['date'] for exchange in data]
        self.assertEqual(dates, sorted(dates, reverse=True))

    def test_list_without_auth_returns_401(self):
        """Test that listing exchanges without authentication fails."""
        data = self.get('/backend/currency-exchanges')
        self.assertStatus(401)


# =============================================================================
# Get Currency Exchange Tests
# =============================================================================


class TestGetCurrencyExchange(CurrencyExchangeTestCase):
    """Tests for GET /backend/currency-exchanges/{id}."""

    def test_get_exchange_success(self):
        """Test getting a specific exchange."""
        data = self.get(f'/backend/currency-exchanges/{self.exchange1.id}', **self.auth_headers())
        self.assertStatus(200)
        self.assertEqual(data['id'], self.exchange1.id)
        self.assertEqual(data['from_currency'], 'USD')
        self.assertEqual(data['to_currency'], 'EUR')
        self.assertEqual(str(data['from_amount']), '100.00')

    def test_get_exchange_not_found(self):
        """Test getting non-existent exchange returns 404."""
        data = self.get('/backend/currency-exchanges/99999', **self.auth_headers())
        self.assertStatus(404)

    def test_get_exchange_without_auth_fails(self):
        """Test that getting an exchange without authentication fails."""
        data = self.get(f'/backend/currency-exchanges/{self.exchange1.id}')
        self.assertStatus(401)


# =============================================================================
# Create Currency Exchange Tests
# =============================================================================


class TestCreateCurrencyExchange(CurrencyExchangeTestCase):
    """Tests for POST /backend/currency-exchanges."""

    def test_create_exchange_success(self):
        """Test creating a new currency exchange."""
        initial_count = CurrencyExchange.objects.count()

        payload = {
            'date': '2025-01-25',
            'description': 'Test exchange',
            'from_currency': 'USD',
            'from_amount': '150.00',
            'to_currency': 'EUR',
            'to_amount': '138.00',
        }
        data = self.post('/backend/currency-exchanges', payload, **self.auth_headers())

        self.assertStatus(201)
        self.assertEqual(data['from_currency'], 'USD')
        self.assertEqual(data['to_currency'], 'EUR')
        self.assertEqual(str(data['from_amount']), '150.00')
        self.assertEqual(data['budget_period_id'], self.period1.id)

        # Verify exchange was created
        self.assertEqual(CurrencyExchange.objects.count(), initial_count + 1)

        # Verify period balances were updated
        balance_usd = PeriodBalance.objects.get(budget_period=self.period1, currency='USD')
        balance_eur = PeriodBalance.objects.get(budget_period=self.period1, currency='EUR')
        self.assertEqual(balance_usd.exchanges_out, Decimal('150.00'))
        self.assertEqual(balance_eur.exchanges_in, Decimal('138.00'))

    def test_create_exchange_calculates_rate(self):
        """Test that exchange rate is calculated correctly."""
        payload = {
            'date': '2025-01-25',
            'from_currency': 'USD',
            'from_amount': '100.00',
            'to_currency': 'EUR',
            'to_amount': '92.50',
        }
        data = self.post('/backend/currency-exchanges', payload, **self.auth_headers())

        self.assertStatus(201)
        # 92.50 / 100.00 = 0.925
        expected_rate = Decimal('92.50') / Decimal('100.00')
        self.assertEqual(Decimal(str(data['exchange_rate'])), expected_rate)

    def test_create_exchange_with_date_outside_period(self):
        """Test creating exchange with date outside any period."""
        # Date in March, but we only have Jan and Feb periods
        payload = {
            'date': '2025-03-15',
            'from_currency': 'USD',
            'from_amount': '100.00',
            'to_currency': 'EUR',
            'to_amount': '92.00',
        }
        data = self.post('/backend/currency-exchanges', payload, **self.auth_headers())

        self.assertStatus(201)
        # budget_period_id should be None
        self.assertIsNone(data['budget_period_id'])

    def test_create_exchange_with_zero_amount_fails(self):
        """Test that creating exchange with zero amount fails."""
        payload = {
            'date': '2025-01-25',
            'from_currency': 'USD',
            'from_amount': '0.00',  # Zero amount
            'to_currency': 'EUR',
            'to_amount': '92.00',
        }
        data = self.post('/backend/currency-exchanges', payload, **self.auth_headers())
        self.assertStatus(422)  # Pydantic validation error

    def test_create_exchange_without_auth_fails(self):
        """Test that creating exchange without authentication fails."""
        payload = {
            'date': '2025-01-25',
            'from_currency': 'USD',
            'from_amount': '100.00',
            'to_currency': 'EUR',
            'to_amount': '92.00',
        }
        data = self.post('/backend/currency-exchanges', payload)
        self.assertStatus(401)

    def test_create_as_viewer_fails(self):
        """Test that viewer role cannot create exchanges."""
        # Change user to viewer
        member = WorkspaceMember.objects.get(workspace=self.workspace, user=self.user)
        member.role = 'viewer'
        member.save()

        payload = {
            'date': '2025-01-25',
            'from_currency': 'USD',
            'from_amount': '100.00',
            'to_currency': 'EUR',
            'to_amount': '92.00',
        }
        data = self.post('/backend/currency-exchanges', payload, **self.auth_headers())
        self.assertStatus(403)

    def test_create_as_member_succeeds(self):
        """Test that member role can create exchanges."""
        # Change user to member
        member = WorkspaceMember.objects.get(workspace=self.workspace, user=self.user)
        member.role = 'member'
        member.save()

        payload = {
            'date': '2025-01-25',
            'from_currency': 'USD',
            'from_amount': '100.00',
            'to_currency': 'EUR',
            'to_amount': '92.00',
        }
        data = self.post('/backend/currency-exchanges', payload, **self.auth_headers())
        self.assertStatus(201)


# =============================================================================
# Update Currency Exchange Tests
# =============================================================================


class TestUpdateCurrencyExchange(CurrencyExchangeTestCase):
    """Tests for PUT /backend/currency-exchanges/{id}."""

    def test_update_exchange_success(self):
        """Test updating an existing exchange."""
        # Refresh balances before update
        balance_usd = PeriodBalance.objects.get(budget_period=self.period1, currency='USD')
        balance_eur = PeriodBalance.objects.get(budget_period=self.period1, currency='EUR')
        original_usd_out = balance_usd.exchanges_out
        original_eur_in = balance_eur.exchanges_in

        payload = {
            'date': '2025-01-16',
            'description': 'Updated exchange',
            'from_currency': 'USD',
            'from_amount': '120.00',
            'to_currency': 'EUR',
            'to_amount': '110.00',
        }
        data = self.put(f'/backend/currency-exchanges/{self.exchange1.id}', payload, **self.auth_headers())

        self.assertStatus(200)
        self.assertEqual(data['description'], 'Updated exchange')
        self.assertEqual(str(data['from_amount']), '120.00')

        # Verify balances were updated (old reverted, new applied)
        balance_usd.refresh_from_db()
        balance_eur.refresh_from_db()
        expected_usd_out = original_usd_out - Decimal('100.00') + Decimal('120.00')
        expected_eur_in = original_eur_in - Decimal('92.00') + Decimal('110.00')
        self.assertEqual(balance_usd.exchanges_out, expected_usd_out)
        self.assertEqual(balance_eur.exchanges_in, expected_eur_in)

    def test_update_exchange_not_found(self):
        """Test updating non-existent exchange returns 404."""
        payload = {
            'date': '2025-01-16',
            'from_currency': 'USD',
            'from_amount': '100.00',
            'to_currency': 'EUR',
            'to_amount': '92.00',
        }
        data = self.put('/backend/currency-exchanges/99999', payload, **self.auth_headers())
        self.assertStatus(404)

    def test_update_exchange_without_auth_fails(self):
        """Test that updating exchange without authentication fails."""
        payload = {
            'date': '2025-01-16',
            'from_currency': 'USD',
            'from_amount': '100.00',
            'to_currency': 'EUR',
            'to_amount': '92.00',
        }
        data = self.put(f'/backend/currency-exchanges/{self.exchange1.id}', payload)
        self.assertStatus(401)

    def test_update_as_viewer_fails(self):
        """Test that viewer role cannot update exchanges."""
        # Change user to viewer
        member = WorkspaceMember.objects.get(workspace=self.workspace, user=self.user)
        member.role = 'viewer'
        member.save()

        payload = {
            'date': '2025-01-16',
            'from_currency': 'USD',
            'from_amount': '100.00',
            'to_currency': 'EUR',
            'to_amount': '92.00',
        }
        data = self.put(f'/backend/currency-exchanges/{self.exchange1.id}', payload, **self.auth_headers())
        self.assertStatus(403)


# =============================================================================
# Delete Currency Exchange Tests
# =============================================================================


class TestDeleteCurrencyExchange(CurrencyExchangeTestCase):
    """Tests for DELETE /backend/currency-exchanges/{id}."""

    def test_delete_exchange_success(self):
        """Test deleting a currency exchange."""
        # Get initial balances
        balance_usd = PeriodBalance.objects.get(budget_period=self.period1, currency='USD')
        balance_eur = PeriodBalance.objects.get(budget_period=self.period1, currency='EUR')
        original_usd_out = balance_usd.exchanges_out
        original_eur_in = balance_eur.exchanges_in

        exchange_id = self.exchange1.id
        self.delete(f'/backend/currency-exchanges/{exchange_id}', **self.auth_headers())
        self.assertStatus(204)

        # Verify exchange is deleted
        self.assertFalse(CurrencyExchange.objects.filter(id=exchange_id).exists())

        # Verify balances were reverted
        balance_usd.refresh_from_db()
        balance_eur.refresh_from_db()
        expected_usd_out = original_usd_out - Decimal('100.00')
        expected_eur_in = original_eur_in - Decimal('92.00')
        self.assertEqual(balance_usd.exchanges_out, expected_usd_out)
        self.assertEqual(balance_eur.exchanges_in, expected_eur_in)

    def test_delete_exchange_not_found(self):
        """Test deleting non-existent exchange returns 404."""
        data = self.delete('/backend/currency-exchanges/99999', **self.auth_headers())
        self.assertStatus(404)

    def test_delete_exchange_without_auth_fails(self):
        """Test that deleting exchange without authentication fails."""
        data = self.delete(f'/backend/currency-exchanges/{self.exchange1.id}')
        self.assertStatus(401)

    def test_delete_as_viewer_fails(self):
        """Test that viewer role cannot delete exchanges."""
        # Change user to viewer
        member = WorkspaceMember.objects.get(workspace=self.workspace, user=self.user)
        member.role = 'viewer'
        member.save()

        data = self.delete(f'/backend/currency-exchanges/{self.exchange1.id}', **self.auth_headers())
        self.assertStatus(403)


# =============================================================================
# Export Currency Exchanges Tests
# =============================================================================


class TestExportCurrencyExchanges(CurrencyExchangeTestCase):
    """Tests for GET /backend/currency-exchanges/export/."""

    def test_export_exchanges_success(self):
        """Test exporting exchanges from a budget period."""
        response = self.client.get(
            f'/backend/currency-exchanges/export/?budget_period_id={self.period1.id}',
            **self.auth_headers(),
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/json')
        self.assertIn('attachment', response['Content-Disposition'])

        # Parse JSON content
        import json

        data = json.loads(response.content)
        self.assertEqual(len(data), 2)  # 2 exchanges in period1
        self.assertEqual(data[0]['from_currency'], 'EUR')  # Ordered by date desc

    def test_export_exchanges_from_other_workspace_fails(self):
        """Test exporting exchanges from another workspace returns 404."""
        # Create another workspace
        other_workspace = Workspace.objects.create(name='Other Workspace')
        other_user = User.objects.create_user(
            email='other@example.com',
            password='otherpass123',
            current_workspace=other_workspace,
        )
        other_workspace.owner = other_user
        other_workspace.save()

        WorkspaceMember.objects.create(
            workspace=other_workspace,
            user=other_user,
            role='owner',
        )

        other_account = BudgetAccount.objects.create(
            workspace=other_workspace,
            name='Other Account',
            created_by=other_user,
        )

        other_period = BudgetPeriod.objects.create(
            budget_account=other_account,
            name='Other Period',
            start_date=date(2025, 4, 1),
            end_date=date(2025, 4, 30),
            created_by=other_user,
        )

        # Try to export with first user
        response = self.client.get(
            f'/backend/currency-exchanges/export/?budget_period_id={other_period.id}',
            **self.auth_headers(),
        )
        self.assertEqual(response.status_code, 404)

    def test_export_exchanges_without_auth_fails(self):
        """Test exporting without authentication fails."""
        response = self.client.get(
            f'/backend/currency-exchanges/export/?budget_period_id={self.period1.id}',
        )
        self.assertEqual(response.status_code, 401)


# =============================================================================
# Import Currency Exchanges Tests
# =============================================================================


class TestImportCurrencyExchanges(CurrencyExchangeTestCase):
    """Tests for POST /backend/currency-exchanges/import."""

    def test_import_exchanges_success(self):
        """Test importing exchanges from a JSON file."""
        import json
        import tempfile

        import_data = [
            {
                'date': '2025-01-10',
                'description': 'Imported exchange 1',
                'from_currency': 'USD',
                'from_amount': '200.00',
                'to_currency': 'EUR',
                'to_amount': '184.00',
            },
            {
                'date': '2025-01-12',
                'description': 'Imported exchange 2',
                'from_currency': 'EUR',
                'from_amount': '100.00',
                'to_currency': 'USD',
                'to_amount': '109.00',
            },
        ]

        # Create a temporary JSON file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(import_data, f)
            f.flush()

            with open(f.name, 'rb') as file:
                response = self.client.post(
                    f'/backend/currency-exchanges/import?budget_period_id={self.period1.id}',
                    data={'file': file},
                    **self.auth_headers(),
                )

        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertIn('Successfully imported 2', data['message'])

        # Verify exchanges were created
        self.assertEqual(
            CurrencyExchange.objects.filter(budget_period=self.period1).count(),
            4,  # 2 original + 2 imported
        )

    def test_import_exchanges_invalid_json_fails(self):
        """Test importing with invalid JSON fails."""
        import tempfile

        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            f.write('invalid json')
            f.flush()

            with open(f.name, 'rb') as file:
                response = self.client.post(
                    f'/backend/currency-exchanges/import?budget_period_id={self.period1.id}',
                    data={'file': file},
                    **self.auth_headers(),
                )

        self.assertEqual(response.status_code, 400)

    def test_import_exchanges_invalid_data_fails(self):
        """Test importing with invalid data format fails."""
        import json
        import tempfile

        import_data = [
            {
                'date': '2025-01-10',
                'from_currency': 'USD',
                'from_amount': 'invalid',  # Invalid amount
                'to_currency': 'EUR',
                'to_amount': '92.00',
            },
        ]

        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(import_data, f)
            f.flush()

            with open(f.name, 'rb') as file:
                response = self.client.post(
                    f'/backend/currency-exchanges/import?budget_period_id={self.period1.id}',
                    data={'file': file},
                    **self.auth_headers(),
                )

        self.assertEqual(response.status_code, 400)

    def test_import_exchanges_without_auth_fails(self):
        """Test importing without authentication fails."""
        import tempfile

        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            f.write('[]')
            f.flush()

            with open(f.name, 'rb') as file:
                response = self.client.post(
                    f'/backend/currency-exchanges/import?budget_period_id={self.period1.id}',
                    data={'file': file},
                )

        self.assertEqual(response.status_code, 401)

    def test_import_as_viewer_fails(self):
        """Test that viewer role cannot import exchanges."""
        # Change user to viewer
        member = WorkspaceMember.objects.get(workspace=self.workspace, user=self.user)
        member.role = 'viewer'
        member.save()

        import json
        import tempfile

        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump([], f)
            f.flush()

            with open(f.name, 'rb') as file:
                response = self.client.post(
                    f'/backend/currency-exchanges/import?budget_period_id={self.period1.id}',
                    data={'file': file},
                    **self.auth_headers(),
                )

        self.assertEqual(response.status_code, 403)
