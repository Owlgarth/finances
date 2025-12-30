"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
"""

from django.contrib import admin
from django.urls import path

from budget_periods.api import router as budget_periods_router
from budgets.api import router as budgets_router
from categories.api import router as categories_router
from core.api import api
from currency_exchanges.api import router as currency_exchanges_router
from period_balances.api import router as period_balances_router
from planned_transactions.api import router as planned_transactions_router
from reports.api import router as reports_router
from transactions.api import router as transactions_router
from workspaces.api import router as workspaces_router

# Register all routers to the API (single entry point for routing)
api.add_router('/budget-periods', budget_periods_router)
api.add_router('/budgets', budgets_router)
api.add_router('/categories', categories_router)
api.add_router('/currency-exchanges', currency_exchanges_router)
api.add_router('/period-balances', period_balances_router)
api.add_router('/planned-transactions', planned_transactions_router)
api.add_router('/reports', reports_router)
api.add_router('/transactions', transactions_router)
api.add_router('/workspaces', workspaces_router)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', api.urls),
]
