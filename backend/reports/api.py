"""Django-Ninja API endpoints for reports app."""

from ninja import Router

from common.auth import WorkspaceJWTAuth
from common.services.base import get_workspace_currencies
from reports.schemas import CurrentBalancesResponse
from reports.services import ReportService

router = Router(tags=['Reports'])

# The budget-summary endpoint was deleted with the legacy allocation app in B4.
# Rebuilt in B8 on budgeting models.


@router.get('/current-balances', response=CurrentBalancesResponse, auth=WorkspaceJWTAuth())
def current_balances(request):
    """Get the current balances for all currencies in the workspace."""
    workspace_id = request.auth.current_workspace_id

    currencies = get_workspace_currencies(workspace_id)
    result = ReportService.get_current_balances(workspace_id, currencies)
    return CurrentBalancesResponse(balances=result)
