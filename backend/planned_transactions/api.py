"""Django-Ninja API endpoints for planned_transactions app."""

import json
from datetime import date
from decimal import Decimal

from django.http import HttpRequest, HttpResponse
from django.utils.translation import gettext as _
from ninja import File, Form, Query, Router
from ninja.files import UploadedFile

from common.auth import WorkspaceJWTAuth
from common.idempotency import parse_idempotency_key
from common.permissions import require_role
from common.throttle import validate_file_size
from core.schemas.common import DetailOut
from core.schemas.pagination import ALLOWED_PAGE_SIZES, PaginatedOut
from planned_transactions.schemas import (
    PlannedTransactionCreate,
    PlannedTransactionOut,
    PlannedTransactionTotalsResponse,
    RecurringTransactionCreate,
    RecurringTransactionOut,
)
from planned_transactions.services import PlannedTransactionService, RecurringTransactionService
from workspaces.models import WRITE_ROLES

router = Router(tags=['Planned Transactions'])
recurring_router = Router(tags=['Recurring Transactions'])

ORDERING_PATTERN = r'^(-?(name|amount|status|planned_date|category__name|account__name|currency__code))$'

# Upper bound for page_size on list endpoints — derived from the pagination
# module's allowed sizes so the API cap stays in lockstep with the service layer.
MAX_PAGE_SIZE = max(ALLOWED_PAGE_SIZES)


# =============================================================================
# Planned Transaction Endpoints
# =============================================================================


@router.get('', response=PaginatedOut[PlannedTransactionOut], auth=WorkspaceJWTAuth())
def list_planned(
    request: HttpRequest,
    status: str | None = Query(None),
    account_id: list[int] | None = Query(None),
    currency_code: list[str] | None = Query(None),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    category_id: list[int] | None = Query(None),
    budget_id: list[int] | None = Query(None),
    search: str | None = Query(None),
    amount_gte: Decimal | None = Query(None),
    amount_lte: Decimal | None = Query(None),
    ordering: str | None = Query(None, pattern=ORDERING_PATTERN),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=MAX_PAGE_SIZE),
):
    """List planned transactions for the current workspace with optional filters.

    currency_code filters by the planned transaction's own stored currency;
    unknown codes match nothing (filters are not resource lookups).
    """
    workspace_id = request.auth.current_workspace_id
    return PlannedTransactionService.list(
        workspace_id,
        status,
        account_id,
        start_date,
        end_date,
        category_id=category_id,
        budget_id=budget_id,
        currency_code=currency_code,
        search=search,
        amount_gte=amount_gte,
        amount_lte=amount_lte,
        ordering=ordering,
        page=page,
        page_size=page_size,
    )


@router.post('', response={201: PlannedTransactionOut, 400: dict, 404: DetailOut}, auth=WorkspaceJWTAuth())
def create_planned(request: HttpRequest, data: PlannedTransactionCreate):
    """Create a new planned transaction (requires write access).

    Optional `Idempotency-Key` request header: if present, a replay with the
    same key (per user, within 24h) returns the original planned transaction
    instead of creating a duplicate. See `PlannedTransactionService.create`.
    """
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)

    idempotency_key, error = parse_idempotency_key(request)
    if error:
        return 400, error

    planned = PlannedTransactionService.create(user, workspace_id, data, idempotency_key=idempotency_key)
    return 201, planned


@router.get('/totals', response=PlannedTransactionTotalsResponse, auth=WorkspaceJWTAuth())
def planned_totals(
    request: HttpRequest,
    status: str | None = Query(None),
    account_id: list[int] | None = Query(None),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    category_id: list[int] | None = Query(None),
    budget_id: list[int] | None = Query(None),
    currency_code: list[str] | None = Query(None),
    search: str | None = Query(None),
    amount_gte: Decimal | None = Query(None),
    amount_lte: Decimal | None = Query(None),
    group_by: str = Query('currency', pattern=r'^(currency|category)$'),
):
    """Get aggregated planned transaction totals grouped by currency or category.

    currency_code filters by the planned transaction's own stored currency;
    unknown codes match nothing (filters are not resource lookups).
    """
    workspace_id = request.auth.current_workspace_id
    return {
        'totals': PlannedTransactionService.totals(
            workspace_id,
            status,
            account_id,
            start_date,
            end_date,
            category_id=category_id,
            budget_id=budget_id,
            currency_code=currency_code,
            search=search,
            amount_gte=amount_gte,
            amount_lte=amount_lte,
            group_by=group_by,
        )
    }


# Specific routes must come before parameterized routes
@router.get('/export/', auth=WorkspaceJWTAuth())
def export_planned_transactions(
    request: HttpRequest,
    status: str | None = Query(None),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
):
    """Export planned transactions as JSON."""
    workspace_id = request.auth.current_workspace_id

    export_data = PlannedTransactionService.export(workspace_id, status, start_date, end_date)
    response = HttpResponse(
        json.dumps(export_data, indent=2),
        content_type='application/json',
    )
    response['Content-Disposition'] = 'attachment; filename=planned_export.json'
    return response


@router.post('/import', response={201: dict, 400: dict, 403: DetailOut, 404: DetailOut}, auth=WorkspaceJWTAuth())
def import_planned_transactions(
    request: HttpRequest,
    account_id: int = Form(...),
    budget_id: int | None = Form(None),
    file: UploadedFile = File(...),
):
    """Import planned transactions from a JSON file into an account (requires write access)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)

    validate_file_size(file, max_size_mb=5)

    try:
        data = json.loads(file.read())
    except (json.JSONDecodeError, UnicodeDecodeError):
        return 400, {'detail': _('Invalid JSON file.')}

    count = PlannedTransactionService.import_data(user, workspace_id, account_id, data, budget_id)
    if count == 0:
        return 201, {'message': _('No new planned transactions to import.')}
    return 201, {'message': _('Successfully imported %(count)s new planned transactions.') % {'count': count}}


# Parameterized routes must come after specific routes
@router.get('/{planned_id}', response={200: PlannedTransactionOut, 404: DetailOut}, auth=WorkspaceJWTAuth())
def get_planned(request: HttpRequest, planned_id: int):
    """Get a specific planned transaction by ID."""
    workspace_id = request.auth.current_workspace_id
    return PlannedTransactionService.get_planned(planned_id, workspace_id)


@router.put(
    '/{planned_id}', response={200: PlannedTransactionOut, 400: DetailOut, 404: DetailOut}, auth=WorkspaceJWTAuth()
)
def update_planned(request: HttpRequest, planned_id: int, data: PlannedTransactionCreate):
    """Update a planned transaction (requires write access)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)

    planned = PlannedTransactionService.update(user, workspace_id, planned_id, data)
    return planned


@router.delete('/{planned_id}', response={204: None, 404: DetailOut}, auth=WorkspaceJWTAuth())
def delete_planned(request: HttpRequest, planned_id: int):
    """Delete a planned transaction (requires write access)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)

    PlannedTransactionService.delete(workspace_id, planned_id)
    return 204, None


@router.post(
    '/{planned_id}/execute',
    response={200: PlannedTransactionOut, 400: DetailOut, 404: DetailOut},
    auth=WorkspaceJWTAuth(),
)
def execute_planned(
    request: HttpRequest,
    planned_id: int,
    payment_date: date = Query(...),
):
    """Execute a planned transaction, creating an actual transaction (requires write access)."""
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)

    planned = PlannedTransactionService.execute(user, workspace_id, planned_id, payment_date)
    return planned


# =============================================================================
# Recurring Transaction Endpoints
# =============================================================================


@recurring_router.get('', response=list[RecurringTransactionOut], auth=WorkspaceJWTAuth())
def list_recurring(request: HttpRequest, include_inactive: bool = Query(False)):
    """List recurring transaction rules of the current workspace (non-paginated).

    Active rules only by default; include_inactive=true also returns paused rules.
    """
    workspace_id = request.auth.current_workspace_id
    return RecurringTransactionService.list(workspace_id, include_inactive)


@recurring_router.post(
    '',
    response={201: RecurringTransactionOut, 400: DetailOut, 403: DetailOut, 404: DetailOut},
    auth=WorkspaceJWTAuth(),
)
def create_recurring(request: HttpRequest, data: RecurringTransactionCreate):
    """Create a recurring transaction rule (requires write access).

    The first due occurrence materializes immediately (sync-generate). With
    adopt_planned_id in the payload, the referenced pending planned transaction
    is adopted as the first occurrence instead of duplicated.
    """
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    return 201, RecurringTransactionService.create(user, workspace_id, data)


@recurring_router.get(
    '/{recurring_id}', response={200: RecurringTransactionOut, 404: DetailOut}, auth=WorkspaceJWTAuth()
)
def get_recurring(request: HttpRequest, recurring_id: int):
    """Get a specific recurring transaction rule by ID."""
    workspace_id = request.auth.current_workspace_id
    return RecurringTransactionService.get_recurring(recurring_id, workspace_id)


@recurring_router.put(
    '/{recurring_id}',
    response={200: RecurringTransactionOut, 400: DetailOut, 403: DetailOut, 404: DetailOut},
    auth=WorkspaceJWTAuth(),
)
def update_recurring(request: HttpRequest, recurring_id: int, data: RecurringTransactionCreate):
    """Update (full-replace) a recurring transaction rule (requires write access).

    is_active is part of the replace payload: omitted it defaults to True (a
    PUT that leaves it out re-activates a paused rule), send false to pause.
    Edits are future-only - already-materialized pending rows are untouched.
    """
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    return RecurringTransactionService.update(user, workspace_id, recurring_id, data)


@recurring_router.delete(
    '/{recurring_id}', response={204: None, 403: DetailOut, 404: DetailOut}, auth=WorkspaceJWTAuth()
)
def delete_recurring(request: HttpRequest, recurring_id: int, delete_pending: bool = Query(False)):
    """Delete a recurring transaction rule (requires write access).

    delete_pending=true also deletes the rule's linked PENDING planned
    transactions; done/cancelled rows always survive.
    """
    user = request.auth
    workspace_id = request.auth.current_workspace_id
    require_role(user, workspace_id, WRITE_ROLES)
    RecurringTransactionService.delete(workspace_id, recurring_id, delete_pending=delete_pending)
    return 204, None
