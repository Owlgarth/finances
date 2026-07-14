"""Django-Ninja API endpoints for reports app."""

from ninja import Query, Router

from common.auth import WorkspaceJWTAuth
from core.schemas import DetailOut
from reports.schemas import BudgetHistoryResponse, BudgetSummaryResponse, CurrentBalancesResponse
from reports.services import ReportService

router = Router(tags=['Reports'])


@router.get('/budget-summary', response={200: BudgetSummaryResponse, 404: DetailOut}, auth=WorkspaceJWTAuth())
def budget_summary(request, budget_id: int = Query(...), period_id: int = Query(...)):
    """Planned vs actual per category for a budget's period."""
    workspace_id = request.auth.current_workspace_id
    return ReportService.get_budget_summary(workspace_id, budget_id, period_id)


@router.get('/budget-history', response={200: BudgetHistoryResponse, 404: DetailOut}, auth=WorkspaceJWTAuth())
def budget_history(request, budget_id: int = Query(...), limit: int = Query(6, ge=1, le=24)):
    """Planned vs actual totals per currency for the budget's most recent periods, oldest first."""
    workspace_id = request.auth.current_workspace_id
    return ReportService.get_budget_history(workspace_id, budget_id, limit)


@router.get('/current-balances', response=CurrentBalancesResponse, auth=WorkspaceJWTAuth())
def current_balances(request, include_archived: bool = Query(False)):
    """Computed balance per account plus per-currency totals."""
    workspace_id = request.auth.current_workspace_id
    return ReportService.get_current_balances(workspace_id, include_archived)
