"""Django-Ninja API endpoints for currency_exchanges app."""

import json

from django.db import transaction
from django.http import HttpRequest, HttpResponse
from ninja import File, Form, Query, Router
from ninja.errors import HttpError
from ninja.files import UploadedFile

from budget_periods.models import BudgetPeriod
from common.auth import JWTAuth
from currency_exchanges.models import CurrencyExchange
from currency_exchanges.schemas import (
    CurrencyExchangeCreate,
    CurrencyExchangeImport,
    CurrencyExchangeOut,
    CurrencyExchangeUpdate,
)
from period_balances.models import PeriodBalance
from workspaces.models import WorkspaceMember

router = Router(tags=['Currency Exchanges'])


# =============================================================================
# Helper Functions
# =============================================================================


def get_workspace_period(period_id: int, workspace_id: int) -> BudgetPeriod:
    """Helper to get a period and verify it belongs to the current workspace."""
    period = (
        BudgetPeriod.objects.select_related('budget_account')
        .filter(id=period_id, budget_account__workspace_id=workspace_id)
        .first()
    )
    if not period:
        return None
    return period


def get_workspace_exchange(exchange_id: int, workspace_id: int) -> CurrencyExchange:
    """Helper to get an exchange and verify it belongs to the current workspace."""
    exchange = (
        CurrencyExchange.objects.select_related('budget_period__budget_account')
        .filter(
            id=exchange_id,
            budget_period__budget_account__workspace_id=workspace_id,
        )
        .first()
    )
    if not exchange:
        return None
    return exchange


def get_or_create_period_balance(period_id: int, currency: str) -> PeriodBalance:
    """Get or create a period balance for a given currency."""
    balance, created = PeriodBalance.objects.get_or_create(
        budget_period_id=period_id,
        currency=currency,
        defaults={
            'opening_balance': 0,
            'total_income': 0,
            'total_expenses': 0,
            'exchanges_in': 0,
            'exchanges_out': 0,
            'closing_balance': 0,
        },
    )
    return balance


def update_period_balance(balance: PeriodBalance) -> None:
    """Update closing balance based on other fields."""
    balance.closing_balance = (
        balance.opening_balance
        + balance.total_income
        - balance.total_expenses
        + balance.exchanges_in
        - balance.exchanges_out
    )
    balance.save(update_fields=['exchanges_in', 'exchanges_out', 'closing_balance'])


def require_role(user, workspace_id: int, allowed_roles: list[str]) -> None:
    """Raise error if user's role is not in allowed_roles."""
    try:
        member = WorkspaceMember.objects.get(workspace_id=workspace_id, user=user)
        role = member.role
    except WorkspaceMember.DoesNotExist:
        role = 'viewer'
    if role not in allowed_roles:
        raise HttpError(403, f'Insufficient permissions. Required: {", ".join(allowed_roles)}. Your role: {role}')


# =============================================================================
# Currency Exchange Endpoints
# =============================================================================


@router.get('', response=list[CurrencyExchangeOut], auth=JWTAuth())
def list_exchanges(
    request: HttpRequest,
    budget_period_id: int | None = Query(None),
):
    """List currency exchanges for the current workspace."""
    workspace = request.auth.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    queryset = CurrencyExchange.objects.select_related('budget_period').filter(
        budget_period__budget_account__workspace_id=workspace.id
    )

    if budget_period_id:
        queryset = queryset.filter(budget_period_id=budget_period_id)

    return list(queryset.order_by('-date'))


@router.post('', response={201: CurrencyExchangeOut, 400: dict}, auth=JWTAuth())
def create_exchange(request: HttpRequest, data: CurrencyExchangeCreate):
    """Create a new currency exchange (requires write access)."""
    user = request.auth
    workspace = user.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    require_role(user, workspace.id, ['owner', 'admin', 'member'])

    with transaction.atomic():
        # Find period within current workspace
        period = (
            BudgetPeriod.objects.select_related('budget_account')
            .filter(
                budget_account__workspace_id=workspace.id,
                start_date__lte=data.date,
                end_date__gte=data.date,
            )
            .first()
        )
        period_id = period.id if period else None

        # Calculate exchange rate
        exchange_rate = data.to_amount / data.from_amount

        # Create exchange
        exchange = CurrencyExchange.objects.create(
            date=data.date,
            description=data.description,
            from_currency=data.from_currency,
            from_amount=data.from_amount,
            to_currency=data.to_currency,
            to_amount=data.to_amount,
            exchange_rate=exchange_rate,
            budget_period_id=period_id,
            created_by=user,
            updated_by=user,
        )

        # Update balances
        if period_id:
            # Debit from_currency
            balance_from = get_or_create_period_balance(period_id, data.from_currency)
            balance_from.exchanges_out += data.from_amount
            update_period_balance(balance_from)

            # Credit to_currency
            balance_to = get_or_create_period_balance(period_id, data.to_currency)
            balance_to.exchanges_in += data.to_amount
            update_period_balance(balance_to)

    return 201, exchange


# Specific routes must come before parameterized routes
@router.get('/export/', auth=JWTAuth())
def export_exchanges(
    request: HttpRequest,
    budget_period_id: int = Query(...),
):
    """Export currency exchanges from a budget period to a JSON file."""
    workspace = request.auth.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    period = get_workspace_period(budget_period_id, workspace.id)
    if not period:
        raise HttpError(404, 'Budget period not found')

    exchanges = CurrencyExchange.objects.filter(budget_period_id=budget_period_id).order_by('-date')

    export_data = []
    for exchange in exchanges:
        export_data.append(
            {
                'date': exchange.date.isoformat(),
                'description': exchange.description,
                'from_currency': exchange.from_currency,
                'from_amount': str(exchange.from_amount),
                'to_currency': exchange.to_currency,
                'to_amount': str(exchange.to_amount),
                'exchange_rate': str(exchange.exchange_rate) if exchange.exchange_rate else None,
            }
        )

    response = HttpResponse(
        json.dumps(export_data, indent=2),
        content_type='application/json',
    )
    response['Content-Disposition'] = f'attachment; filename=currency_exchanges_export_{budget_period_id}.json'
    return response


@router.post('/import', response={201: dict, 400: dict}, auth=JWTAuth())
def import_exchanges(
    request: HttpRequest,
    budget_period_id: int = Form(...),
    file: UploadedFile = File(...),
):
    """Import currency exchanges from a JSON file into a budget period (requires write access)."""
    user = request.auth
    workspace = user.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    require_role(user, workspace.id, ['owner', 'admin', 'member'])

    period = get_workspace_period(budget_period_id, workspace.id)
    if not period:
        raise HttpError(404, 'Budget period not found')

    # Read and parse file
    try:
        contents = file.read()
        data = json.loads(contents)
    except json.JSONDecodeError:
        return 400, {'error': 'Invalid JSON file.'}
    except Exception as e:
        return 400, {'error': f'Invalid data format: {e}'}

    with transaction.atomic():
        new_exchanges = []
        for item in data:
            # Create import schema instance for validation
            try:
                import_item = CurrencyExchangeImport(**item)
            except Exception as e:
                return 400, {'error': f'Invalid data format: {e}'}

            # Calculate exchange rate
            exchange_rate = import_item.to_amount / import_item.from_amount

            new_exchange = CurrencyExchange(
                date=import_item.date,
                description=import_item.description,
                from_currency=import_item.from_currency,
                from_amount=import_item.from_amount,
                to_currency=import_item.to_currency,
                to_amount=import_item.to_amount,
                exchange_rate=exchange_rate,
                budget_period_id=budget_period_id,
                created_by=user,
                updated_by=user,
            )
            new_exchanges.append(new_exchange)

        if not new_exchanges:
            return 201, {'message': 'No new currency exchanges to import.'}

        CurrencyExchange.objects.bulk_create(new_exchanges)

        # Update balances for imported exchanges
        for exchange in new_exchanges:
            # Debit from_currency
            balance_from = get_or_create_period_balance(budget_period_id, exchange.from_currency)
            balance_from.exchanges_out += exchange.from_amount
            update_period_balance(balance_from)

            # Credit to_currency
            balance_to = get_or_create_period_balance(budget_period_id, exchange.to_currency)
            balance_to.exchanges_in += exchange.to_amount
            update_period_balance(balance_to)

    return 201, {'message': f'Successfully imported {len(new_exchanges)} new currency exchanges.'}


# Parameterized routes must come after specific routes
@router.get('/{exchange_id}', response=CurrencyExchangeOut, auth=JWTAuth())
def get_exchange(request: HttpRequest, exchange_id: int):
    """Get a specific currency exchange."""
    workspace = request.auth.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    exchange = get_workspace_exchange(exchange_id, workspace.id)
    if not exchange:
        raise HttpError(404, 'Exchange not found')

    return exchange


@router.put('/{exchange_id}', response=CurrencyExchangeOut, auth=JWTAuth())
def update_exchange(request: HttpRequest, exchange_id: int, data: CurrencyExchangeUpdate):
    """Update a currency exchange (requires write access)."""
    user = request.auth
    workspace = user.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    require_role(user, workspace.id, ['owner', 'admin', 'member'])

    exchange = get_workspace_exchange(exchange_id, workspace.id)
    if not exchange:
        raise HttpError(404, 'Exchange not found')

    with transaction.atomic():
        # Revert old balances
        if exchange.budget_period_id:
            balance_from = get_or_create_period_balance(exchange.budget_period_id, exchange.from_currency)
            balance_from.exchanges_out -= exchange.from_amount
            update_period_balance(balance_from)

            balance_to = get_or_create_period_balance(exchange.budget_period_id, exchange.to_currency)
            balance_to.exchanges_in -= exchange.to_amount
            update_period_balance(balance_to)

        # Find new period within current workspace
        period = (
            BudgetPeriod.objects.select_related('budget_account')
            .filter(
                budget_account__workspace_id=workspace.id,
                start_date__lte=data.date,
                end_date__gte=data.date,
            )
            .first()
        )
        new_period_id = period.id if period else None

        # Calculate new exchange rate
        exchange_rate = data.to_amount / data.from_amount

        # Update exchange
        exchange.date = data.date
        exchange.description = data.description
        exchange.from_currency = data.from_currency
        exchange.from_amount = data.from_amount
        exchange.to_currency = data.to_currency
        exchange.to_amount = data.to_amount
        exchange.budget_period_id = new_period_id
        exchange.exchange_rate = exchange_rate
        exchange.updated_by = user
        exchange.save()

        # Apply new balances
        if new_period_id:
            # Debit from_currency
            balance_from = get_or_create_period_balance(new_period_id, data.from_currency)
            balance_from.exchanges_out += data.from_amount
            update_period_balance(balance_from)

            # Credit to_currency
            balance_to = get_or_create_period_balance(new_period_id, data.to_currency)
            balance_to.exchanges_in += data.to_amount
            update_period_balance(balance_to)

    return exchange


@router.delete('/{exchange_id}', response={204: None}, auth=JWTAuth())
def delete_exchange(request: HttpRequest, exchange_id: int):
    """Delete a currency exchange (requires write access)."""
    user = request.auth
    workspace = user.current_workspace

    if not workspace:
        raise HttpError(404, 'No workspace selected')

    require_role(user, workspace.id, ['owner', 'admin', 'member'])

    exchange = get_workspace_exchange(exchange_id, workspace.id)
    if not exchange:
        raise HttpError(404, 'Exchange not found')

    with transaction.atomic():
        # Revert balances
        if exchange.budget_period_id:
            balance_from = get_or_create_period_balance(exchange.budget_period_id, exchange.from_currency)
            balance_from.exchanges_out -= exchange.from_amount
            update_period_balance(balance_from)

            balance_to = get_or_create_period_balance(exchange.budget_period_id, exchange.to_currency)
            balance_to.exchanges_in -= exchange.to_amount
            update_period_balance(balance_to)

        exchange.delete()

    return 204, None
