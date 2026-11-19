"""Create or reset the known-credentials QA demo user.

Idempotent orchestrator over existing services - it never sends emails and
never touches other users' data. The default run heals the user (known
password, active, verified, 2FA cleared, current legal consents recorded)
without touching workspace data. ``--reset`` instead wipes every workspace
the user owns via ``UserService.reset_account`` and layers demo fixtures on
the fresh workspace. Refuses to run with known credentials when
``settings.DEBUG`` is False unless ``--force`` is passed.
"""

from decimal import Decimal

from django.conf import settings
from django.contrib.auth import get_user_model, password_validation
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction
from django.db.models import Max, Min

from accounts.models import Account, AccountType
from budgeting.models import Budget, CategoryBudget, Period
from categories.models import Category
from core.legal import get_privacy, get_terms
from currencies.services import CurrencyCatalogService
from planned_transactions.models import PlannedTransaction
from transactions.models import Transaction
from transfers.models import Transfer
from users.models import ConsentType, UserConsent, UserTwoFactor
from users.services import UserService
from workspaces.demo_fixtures import create_demo_fixtures
from workspaces.services import WorkspaceService

User = get_user_model()

DEFAULT_QA_EMAIL = 'qa@owlgarth.local'
DEFAULT_PASSWORD = 'OwlgarthQA!2026'


def _validate_password(password: str, user) -> None:
    """Raise CommandError when the password fails AUTH_PASSWORD_VALIDATORS."""
    try:
        password_validation.validate_password(password, user=user)
    except DjangoValidationError as exc:
        messages = '; '.join(exc.messages)
        raise CommandError(f'Password failed validation: {messages}')


def _ensure_prerequisites() -> None:
    """Seed the global catalogs the QA workspace and consents depend on."""
    # Both commands are idempotent (update_or_create / skip-when-active), so
    # this is a no-op on an already-seeded stack. get_terms()/get_privacy()
    # raise LegalDocumentUnavailableError without the legal seed, and
    # create_workspace cannot enable PLN/EUR/USD without the currency seed.
    call_command('seed_currencies', verbosity=0)
    call_command('seed_legal_documents', verbosity=0)


def _heal_user(user, password: str) -> None:
    """Restore the known QA login state: password, active, verified, no 2FA."""
    # set_password unconditionally would re-stamp password_changed_at on every
    # re-run (killing the tester's refresh tokens for no reason) - rehash only
    # when the known password no longer verifies.
    if not user.check_password(password):
        user.set_password(password)
    user.is_active = True
    user.email_verified = True
    user.save(update_fields=['password', 'password_changed_at', 'is_active', 'email_verified'])
    # A 2FA row left enabled by a prior test session would break known-
    # credential login; UserTwoFactor is OneToOne, so filter().delete() is a
    # no-op when none exists.
    UserTwoFactor.objects.filter(user=user).delete()


def _record_consents(user) -> None:
    """Grant current legal versions when missing or outdated (append-only audit)."""
    # record_consent creates unconditionally - checking first is what keeps
    # re-runs from stacking duplicate grant rows.
    for consent_type, version in (
        (ConsentType.TERMS_OF_SERVICE, get_terms()['version']),
        (ConsentType.PRIVACY_POLICY, get_privacy()['version']),
    ):
        if not UserConsent.objects.filter(
            user=user, consent_type=consent_type, version=version, withdrawn_at__isnull=True
        ).exists():
            UserService.record_consent(user, consent_type, version)


def _get_or_create_travel_account(user, workspace) -> Account:
    """Ensure the EUR Travel account exists with an opening balance (get-or-create by name)."""
    account = Account.objects.filter(workspace_id=workspace.id, name='Travel').first()
    if account:
        return account
    # enable() is idempotent (EUR is enabled by create_workspace defaults);
    # re-calling also heals a workspace where EUR was disabled. is_default_
    # for_currency is never set: the Main account owns that flag for its
    # currency, and the partial unique constraint must stay untouched.
    euro = CurrencyCatalogService.enable(user, workspace.id, 'EUR')
    return Account.objects.create(
        workspace_id=workspace.id,
        name='Travel',
        type=AccountType.BANK,
        currency=euro,
        opening_balance=Decimal('2500.00'),
        created_by_id=user.id,
    )


class Command(BaseCommand):
    help = 'Create or reset the known-credentials QA demo user with demo data (idempotent)'

    def add_arguments(self, parser):
        parser.add_argument('--email', default=DEFAULT_QA_EMAIL, help=f'QA user email (default: {DEFAULT_QA_EMAIL})')
        parser.add_argument(
            '--password',
            default=DEFAULT_PASSWORD,
            help='QA user password (defaults to the built-in known QA password)',
        )
        parser.add_argument('--reset', action='store_true', help='Wipe owned workspaces and re-seed demo data')
        parser.add_argument(
            '--force',
            action='store_true',
            help='Allow seeding known credentials even when DEBUG is False',
        )

    def _write_summary(self, user, password: str, workspace, workspace_state: str) -> None:
        """Print credentials plus a summary whose counts are queried from the DB."""
        account_count = Account.objects.filter(workspace_id=workspace.id).count()
        account_names = ', '.join(Account.objects.filter(workspace_id=workspace.id).values_list('name', flat=True))
        currency_codes = ', '.join(c.code for c in CurrencyCatalogService.list_enabled(workspace.id))
        transaction_count = Transaction.objects.filter(workspace_id=workspace.id).count()
        transaction_dates = Transaction.objects.filter(workspace_id=workspace.id).aggregate(
            first=Min('date'), last=Max('date')
        )
        transfer_count = Transfer.objects.filter(workspace_id=workspace.id).count()
        planned_total = PlannedTransaction.objects.filter(workspace_id=workspace.id).count()
        planned_done = PlannedTransaction.objects.filter(workspace_id=workspace.id, status='done').count()
        category_count = Category.objects.filter(workspace_id=workspace.id).count()
        budget = Budget.objects.filter(workspace_id=workspace.id).first()
        period_count = Period.objects.filter(workspace_id=workspace.id).count()
        estimate_count = CategoryBudget.objects.filter(workspace_id=workspace.id).count()

        date_span = f'{transaction_dates["first"]} to {transaction_dates["last"]}' if transaction_count else 'no rows'
        consent_line = f'terms_of_service v{get_terms()["version"]}, privacy_policy v{get_privacy()["version"]}'

        self.stdout.write(self.style.SUCCESS(f'QA user ready: {user.email} / {password}'))
        self.stdout.write(f'  workspace:    {workspace_state} {workspace.name} (id={workspace.id})')
        self.stdout.write(f'  currencies:   {currency_codes}')
        self.stdout.write(f'  accounts:     {account_count} ({account_names})')
        self.stdout.write(f'  transactions: {transaction_count} ({date_span})')
        self.stdout.write(f'  transfers:    {transfer_count}')
        self.stdout.write(f'  planned:      {planned_total} ({planned_done} done)')
        self.stdout.write(f'  categories:   {category_count}')
        self.stdout.write(f'  budget:       {budget.name} - {period_count} periods, {estimate_count} estimates')
        self.stdout.write(f'  consents:     {consent_line}')

    def handle(self, *args, **options):
        if not settings.DEBUG and not options['force']:
            raise CommandError(
                'Refusing to seed a known-credentials QA user while DEBUG is False - '
                'a known password on a real stack is a backdoor. Pass --force to override.'
            )

        # Emails are stored lowercase (UserManager.normalize_email / User.save);
        # normalizing here keeps lookups and creates on the same key when a
        # custom --email is passed with different casing.
        email = options['email'].lower().strip()
        password = options['password']

        user = User.objects.filter(email=email).first()
        _validate_password(password, user)
        _ensure_prerequisites()

        with db_transaction.atomic():
            # The services called below (create_workspace, reset_account,
            # CurrencyCatalogService.enable) carry their own @db_transaction.
            # atomic; nested inside this block they become savepoints, so the
            # user, workspace, and consent work commit or roll back together.
            # Re-runs heal any partial state anyway (every step is
            # get-or-create or idempotent), so the outer block is a safety
            # net, not the correctness mechanism.
            if not user:
                user = User.objects.create_user(
                    email=email,
                    password=password,
                    full_name='QA User',
                    email_verified=True,
                )
                # currency_codes left None: defaults enable exactly PLN
                # (primary, position 0) + EUR + USD.
                workspace = WorkspaceService.create_workspace(user=user, name='QA Workspace', create_demo=True)
                workspace_state = 'created'
            elif options['reset']:
                # Heal BEFORE reset_account: it password-checks first, so the
                # set_password inside _heal_user must have run by then.
                _heal_user(user, password)
                result = UserService.reset_account(
                    user=user,
                    password=password,
                    workspace_name='QA Workspace',
                    currency_codes=None,
                    confirm_shared=True,
                )
                # reset_account creates a starter-only workspace; layer the
                # demo rows on top (create_demo was False in the service).
                create_demo_fixtures(workspace_id=result['workspace_id'], user_id=user.id)
                # reset_account -> create_workspace set it on this instance.
                workspace = user.current_workspace
                workspace_state = 'reset'
            else:
                _heal_user(user, password)
                if user.current_workspace:
                    # Heal never touches workspace data.
                    workspace = user.current_workspace
                    workspace_state = 'existing'
                else:
                    # Zero-workspace QA user (everything deleted mid-session):
                    # nothing to preserve, so complete the invariant that the
                    # command always ends with a usable workspace.
                    workspace = WorkspaceService.create_workspace(user=user, name='QA Workspace', create_demo=True)
                    workspace_state = 'created'

            _get_or_create_travel_account(user, workspace)
            _record_consents(user)

        # Summary reads committed state, outside the atomic block.
        self._write_summary(user, password, workspace, workspace_state)
