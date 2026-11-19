"""Tests for the seed_qa_user management command (create, heal, reset paths).

All expected counts trace to workspaces/demo_fixtures.py (16 previous-month
+ 10 current-month transactions, 2 transfers, 4 planned of which 1 done,
7 starter categories, 7 x 2 = 14 estimates) plus the command's own EUR
Travel account. Counts are calendar-independent: current-month rows clamp
their dates to today but are always created. Django forces settings.DEBUG
to False during tests regardless of the configured value, so the harness
pins DEBUG=True explicitly (the guard reads it at call time); only the
guard tests override it back to False.
"""

import calendar
from datetime import date, timedelta
from decimal import Decimal
from io import StringIO
from unittest import mock

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings
from django.utils import timezone

from accounts.models import Account
from budgeting.models import Budget, CategoryBudget, Period
from categories.models import Category
from common.tests.factories import UserFactory
from core.factories import LegalDocumentFactory
from core.legal import get_privacy, get_terms
from core.models import LegalDocument
from currencies.services import CurrencyCatalogService
from planned_transactions.models import PlannedTransaction
from transactions.factories import TransactionFactory
from transactions.models import Transaction
from transfers.models import Transfer
from users.management.commands.seed_qa_user import DEFAULT_PASSWORD, DEFAULT_QA_EMAIL
from users.models import ConsentType, UserConsent, UserTwoFactor
from users.services import UserService
from workspaces.factories import WorkspaceFactory
from workspaces.models import Workspace

User = get_user_model()


def _month_range(anchor: date) -> tuple[date, date]:
    """First and last day of anchor's calendar month (mirrors period math)."""
    last_day = calendar.monthrange(anchor.year, anchor.month)[1]
    return anchor.replace(day=1), anchor.replace(day=last_day)


@override_settings(DEBUG=True)
class QACommandTestCase(TestCase):
    """Shared harness: run the command, capture output, assert the baseline.

    Not named Test* on purpose: it holds no test methods, and pytest's
    default class collection would otherwise pick it up empty.

    DEBUG=True is pinned because Django's test environment forces
    settings.DEBUG=False regardless of the configured/env value; without
    the pin, every default-path run would trip the command's guard.
    """

    def setUp(self):
        self.today = date.today()
        self.current_month_start, self.current_month_end = _month_range(self.today)
        previous_month_tail = self.current_month_start - timedelta(days=1)
        self.prev_month_start, self.prev_month_end = _month_range(previous_month_tail)

    def run_command(self, **kwargs) -> str:
        out = StringIO()
        call_command('seed_qa_user', stdout=out, **kwargs)
        return out.getvalue()

    def _assert_user_state(self, user):
        user.refresh_from_db()
        self.assertTrue(user.email_verified)
        self.assertTrue(user.is_active)
        self.assertTrue(user.check_password(DEFAULT_PASSWORD))

    def _assert_workspace_shape(self, user) -> Workspace:
        user.refresh_from_db()
        workspace = user.current_workspace
        self.assertIsNotNone(workspace)
        self.assertEqual(workspace.name, 'QA Workspace')
        self.assertEqual(workspace.owner_id, user.id)
        self.assertEqual(Workspace.objects.filter(owner=user).count(), 1)
        return workspace

    def _assert_demo_data(self, workspace):
        # list_enabled orders by position: first entry = position 0 = primary.
        self.assertEqual([c.code for c in CurrencyCatalogService.list_enabled(workspace.id)], ['PLN', 'EUR', 'USD'])

        accounts = Account.objects.filter(workspace_id=workspace.id)
        self.assertEqual(accounts.count(), 3)
        self.assertEqual(set(accounts.values_list('name', flat=True)), {'Main', 'Savings', 'Travel'})
        travel = accounts.get(name='Travel')
        self.assertEqual(travel.currency.code, 'EUR')
        self.assertEqual(travel.opening_balance, Decimal('2500.00'))
        self.assertFalse(travel.is_default_for_currency)
        self.assertTrue(accounts.get(name='Main').is_default_for_currency)

        transactions = Transaction.objects.filter(workspace_id=workspace.id)
        self.assertEqual(transactions.count(), 26)
        self.assertEqual(transactions.filter(date__range=(self.prev_month_start, self.prev_month_end)).count(), 16)
        self.assertEqual(transactions.filter(date__gte=self.current_month_start, date__lte=self.today).count(), 10)
        # Current-month rows clamp to today; nothing ever postdates it.
        self.assertFalse(transactions.filter(date__gt=self.today).exists())

        self.assertEqual(Transfer.objects.filter(workspace_id=workspace.id).count(), 2)
        planned = PlannedTransaction.objects.filter(workspace_id=workspace.id)
        self.assertEqual(planned.count(), 4)
        self.assertEqual(planned.filter(status='done').count(), 1)
        self.assertEqual(planned.filter(status='pending').count(), 3)
        self.assertEqual(Category.objects.filter(workspace_id=workspace.id).count(), 7)

        general = Budget.objects.get(workspace_id=workspace.id, name='General')
        self.assertEqual(Period.objects.filter(budget=general).count(), 2)
        self.assertEqual(CategoryBudget.objects.filter(workspace_id=workspace.id).count(), 14)

    def _assert_consents(self, user):
        consents = UserConsent.objects.filter(user=user)
        self.assertEqual(consents.count(), 2)
        self.assertEqual(
            consents.filter(
                consent_type=ConsentType.TERMS_OF_SERVICE,
                version=get_terms()['version'],
                withdrawn_at__isnull=True,
            ).count(),
            1,
        )
        self.assertEqual(
            consents.filter(
                consent_type=ConsentType.PRIVACY_POLICY,
                version=get_privacy()['version'],
                withdrawn_at__isnull=True,
            ).count(),
            1,
        )
        self.assertIs(UserService.get_consent_status(user)['needs_reconsent'], False)
        # The command never sends emails (create, heal, and reset paths).
        self.assertEqual(len(mail.outbox), 0)

    def assert_baseline(self, user) -> Workspace:
        """Full contract: user state, workspace, demo data, consents, no mail."""
        self._assert_user_state(user)
        workspace = self._assert_workspace_shape(user)
        self._assert_demo_data(workspace)
        self._assert_consents(user)
        return workspace


class TestSeedQAUserFreshCreate(QACommandTestCase):
    """Cold-stack run: one user, one workspace, the full demo contract."""

    def setUp(self):
        super().setUp()
        self.output = self.run_command()
        self.user = User.objects.get(email=DEFAULT_QA_EMAIL)

    def test_user_state_and_workspace(self):
        self._assert_user_state(self.user)
        self.assertEqual(self.user.full_name, 'QA User')
        workspace = self._assert_workspace_shape(self.user)
        self.assertEqual(self.user.current_workspace_id, workspace.id)

    def test_demo_data_contract(self):
        self._assert_demo_data(self.user.current_workspace)

    def test_consents_current_and_no_emails(self):
        self._assert_consents(self.user)

    def test_output_lines(self):
        # Binding output contract from task-1.md: one SUCCESS credentials
        # line, then 2-space-indented plain sub-lines.
        self.assertIn(f'QA user ready: {DEFAULT_QA_EMAIL} / {DEFAULT_PASSWORD}', self.output)
        self.assertIn('  workspace:    created QA Workspace (id=', self.output)
        self.assertIn('  transactions: 26 (', self.output)


class TestSeedQAUserIdempotentHeal(QACommandTestCase):
    """A second run without --reset heals nothing that needs no healing."""

    def test_heal_rerun_changes_nothing(self):
        self.run_command()
        user = User.objects.get(email=DEFAULT_QA_EMAIL)
        workspace_id = user.current_workspace_id

        output = self.run_command()  # no --reset

        user.refresh_from_db()
        self.assertEqual(user.current_workspace_id, workspace_id)
        self.assertEqual(Workspace.objects.filter(owner=user).count(), 1)
        self.assert_baseline(user)
        # Consent grants are not duplicated by the second run (record_consent
        # creates unconditionally; only the command's check prevents stacks).
        self.assertEqual(UserConsent.objects.filter(user=user).count(), 2)
        # No duplicate Travel account: still exactly one, total still 3.
        workspace = user.current_workspace
        self.assertEqual(Account.objects.filter(workspace_id=workspace.id, name='Travel').count(), 1)
        self.assertIn('  workspace:    existing QA Workspace (id=', output)


class TestSeedQAUserHealRepairs(QACommandTestCase):
    """The default run restores the known login state without --reset."""

    def test_heal_restores_password_flags_and_clears_2fa(self):
        self.run_command()
        user = User.objects.get(email=DEFAULT_QA_EMAIL)

        # Drift every heal target: password, flags, and a stray 2FA row.
        user.set_password('DriftedPassword!2026')
        user.is_active = False
        user.email_verified = False
        user.save()
        UserTwoFactor.objects.create(user=user, is_enabled=True, encrypted_secret=b'x', backup_codes=[])
        # Backdate the stamp so the post-heal bump is deterministic (two
        # same-microsecond now() calls would make a plain > comparison
        # flaky). set_password stamps password_changed_at, which is what
        # invalidates pre-existing refresh tokens.
        User.objects.filter(id=user.id).update(password_changed_at=timezone.now() - timedelta(days=1))
        drifted_stamp = User.objects.get(id=user.id).password_changed_at

        self.run_command()  # no --reset: heal only

        user.refresh_from_db()
        self.assertTrue(user.check_password(DEFAULT_PASSWORD))
        self.assertTrue(user.is_active)
        self.assertTrue(user.email_verified)
        self.assertEqual(UserTwoFactor.objects.filter(user=user).count(), 0)
        self.assertGreater(user.password_changed_at, drifted_stamp)

    def test_heal_with_no_current_workspace_creates_one(self):
        # The @tester mid-session scenario: every workspace deleted, then a
        # plain re-run (no --reset). current_workspace=None must be passed
        # explicitly - UserFactory defaults it to a SubFactory workspace.
        UserFactory(email=DEFAULT_QA_EMAIL, current_workspace=None)

        output = self.run_command()  # no --reset

        user = User.objects.get(email=DEFAULT_QA_EMAIL)
        self.assert_baseline(user)
        self.assertIn('  workspace:    created QA Workspace (id=', output)


class TestSeedQAUserHealPreservesData(QACommandTestCase):
    """Heal never touches workspace rows the user added mid-session."""

    def test_heal_leaves_extra_transaction_intact(self):
        self.run_command()
        user = User.objects.get(email=DEFAULT_QA_EMAIL)
        workspace = user.current_workspace
        main = Account.objects.get(workspace_id=workspace.id, name='Main')
        # Factory gotcha: pass account + workspace explicitly, or the
        # factory SubFactories its own unrelated account/workspace.
        TransactionFactory(account=main, workspace=workspace, description='Extra row added by test')

        self.run_command()  # no --reset

        user.refresh_from_db()
        self.assertEqual(user.current_workspace_id, workspace.id)
        self.assertEqual(Transaction.objects.filter(workspace_id=workspace.id).count(), 27)
        self.assertTrue(Transaction.objects.filter(description='Extra row added by test').exists())


class TestSeedQAUserReset(QACommandTestCase):
    """--reset wipes every owned workspace and re-seeds the demo baseline."""

    def test_reset_wipes_owned_workspaces_and_reseeds(self):
        self.run_command()
        user = User.objects.get(email=DEFAULT_QA_EMAIL)
        user_id = user.id
        old_workspace_id = user.current_workspace_id
        main = Account.objects.get(workspace_id=old_workspace_id, name='Main')
        TransactionFactory(account=main, workspace=user.current_workspace, description='Doomed extra row')
        Workspace.objects.filter(id=old_workspace_id).update(name='Renamed Old')
        side = WorkspaceFactory(name='Side Project', owner=user)  # owner must be explicit

        output = self.run_command(reset=True)

        self.assertFalse(Workspace.objects.filter(id=old_workspace_id).exists())
        self.assertFalse(Workspace.objects.filter(id=side.id).exists())
        self.assertFalse(Transaction.objects.filter(description='Doomed extra row').exists())
        self.assertEqual(Workspace.objects.filter(owner=user).count(), 1)

        user.refresh_from_db()
        self.assertEqual(user.id, user_id)  # the user row survives the reset
        workspace = self.assert_baseline(user)  # fresh workspace, full demo counts
        self.assertEqual(workspace.name, 'QA Workspace')
        self.assertEqual(user.current_workspace_id, workspace.id)
        self.assertIn('  workspace:    reset QA Workspace (id=', output)

    def test_reset_with_zero_owned_workspaces(self):
        # Everything deleted mid-session: current_workspace=None must be
        # passed explicitly (UserFactory defaults it to a SubFactory
        # workspace), matching a user who owns nothing.
        UserFactory(email=DEFAULT_QA_EMAIL, current_workspace=None)

        output = self.run_command(reset=True)

        user = User.objects.get(email=DEFAULT_QA_EMAIL)
        self.assert_baseline(user)
        self.assertIn('  workspace:    reset QA Workspace (id=', output)


class TestSeedQAUserCustomCredentials(QACommandTestCase):
    """--email / --password override the built-in identity."""

    def test_custom_email_and_password(self):
        # Mixed case on purpose: the command lowercases before lookup
        # (User.save lowercases emails), so the row lands lowercase.
        self.run_command(email='QA-Two@Owlgarth.Local', password='AnotherSecret!77')

        user = User.objects.get(email='qa-two@owlgarth.local')
        self.assertTrue(user.check_password('AnotherSecret!77'))
        workspace = self._assert_workspace_shape(user)
        self._assert_demo_data(workspace)
        # Only the custom user was created - the default identity stays absent.
        self.assertFalse(User.objects.filter(email=DEFAULT_QA_EMAIL).exists())


class TestSeedQAUserDebugGuard(QACommandTestCase):
    """Known credentials are refused on a non-DEBUG stack unless --force."""

    @override_settings(DEBUG=False)
    def test_refuses_when_debug_false(self):
        with self.assertRaises(CommandError) as ctx:
            self.run_command()
        self.assertIn('--force', str(ctx.exception))
        # The guard fires before any write.
        self.assertFalse(User.objects.filter(email=DEFAULT_QA_EMAIL).exists())

    @override_settings(DEBUG=False)
    def test_force_overrides_debug_guard(self):
        self.run_command(force=True)
        self.assertTrue(User.objects.filter(email=DEFAULT_QA_EMAIL).exists())


class TestSeedQAUserConsentVersionBump(QACommandTestCase):
    """An outdated active consent must not block recording the new version."""

    def test_terms_version_bump_appends_new_consent(self):
        self.run_command()
        user = User.objects.get(email=DEFAULT_QA_EMAIL)
        old_version = get_terms()['version']

        # Apply a legal update the way the seed command would: deactivate the
        # current row, then create the new active version.
        new_version = 'test-bump' if old_version != 'test-bump' else 'test-bump-2'
        LegalDocument.objects.filter(doc_type=LegalDocument.DocType.TERMS_OF_SERVICE, is_active=True).update(
            is_active=False
        )
        LegalDocumentFactory(doc_type=LegalDocument.DocType.TERMS_OF_SERVICE, version=new_version)

        # _ensure_prerequisites would re-seed the repo template's version and
        # revert this bump before the consent step sees it (seed_legal_documents
        # skips only same-version active rows). A production bump arrives via
        # a changed template, which the seed then treats as current; skipping
        # the prerequisite isolates the command's consent-recording branch.
        with mock.patch('users.management.commands.seed_qa_user._ensure_prerequisites'):
            self.run_command()

        terms = UserConsent.objects.filter(user=user, consent_type=ConsentType.TERMS_OF_SERVICE)
        self.assertEqual(terms.count(), 2)
        self.assertTrue(terms.filter(version=new_version, withdrawn_at__isnull=True).exists())
        self.assertTrue(terms.filter(version=old_version).exists())  # append-only audit trail
        self.assertEqual(UserConsent.objects.filter(user=user).count(), 3)
        self.assertIs(UserService.get_consent_status(user)['needs_reconsent'], False)
