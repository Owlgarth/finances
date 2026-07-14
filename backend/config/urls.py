"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
"""

from django.contrib import admin
from django.urls import path
from ninja import NinjaAPI

from accounts.api import router as accounts_router
from budgeting.api import router as budgeting_router
from common.exceptions import ServiceError
from core.api import router as auth_router
from core.legal_api import router as legal_router
from currencies.api import router as currencies_router
from planned_transactions.api import router as planned_transactions_router
from reports.api import router as reports_router
from transactions.api import router as transactions_router
from transfers.api import router as transfers_router
from users.api import router as users_router
from workspaces.api import router as workspaces_router

# Create main API instance (single entry point for routing)
api = NinjaAPI(title='Denarly API', version='1.0.0')


@api.exception_handler(ServiceError)
def service_error_handler(request, exc: ServiceError):
    body: dict = {'detail': exc.message}
    if exc.code:
        body['code'] = exc.code
    return api.create_response(request, body, status=exc.http_status)


# Register all routers to the API
api.add_router('/auth', auth_router)
api.add_router('/legal', legal_router)
api.add_router('/users', users_router)
api.add_router('/accounts', accounts_router)
api.add_router('/budgets', budgeting_router)
api.add_router('/currencies', currencies_router)
api.add_router('/planned-transactions', planned_transactions_router)
api.add_router('/reports', reports_router)
api.add_router('/transactions', transactions_router)
api.add_router('/transfers', transfers_router)
api.add_router('/workspaces', workspaces_router)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', api.urls),
]
