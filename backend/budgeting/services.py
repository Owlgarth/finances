"""Business logic for the budgeting app (budgets, periods, cadence math)."""

import calendar
from datetime import date, timedelta

from django.db import IntegrityError
from django.db import transaction as db_transaction

from budgeting.exceptions import (
    BudgetCadenceConfigError,
    BudgetDuplicateNameError,
    BudgetNotFoundError,
    NoPeriodForDateError,
    PeriodNotEditableError,
    PeriodNotFoundError,
    PeriodOverlapError,
)
from budgeting.models import Budget, Cadence, Period
from budgeting.schemas import BudgetArchive, BudgetCreate, BudgetUpdate, PeriodCreate, PeriodUpdate
from currencies.services import CurrencyCatalogService


class BudgetService:
    @staticmethod
    def _validated_cadence_fields(
        cadence: str, weeks: int | None, anchor: date | None
    ) -> tuple[int | None, date | None]:
        """Validate cadence configuration; normalize weeks/anchor to null for non-WEEKS cadences."""
        if cadence == Cadence.WEEKS:
            if not weeks or weeks < 1 or not anchor:
                raise BudgetCadenceConfigError()
            return weeks, anchor
        return None, None

    @staticmethod
    def list(workspace_id: int, include_inactive: bool = False) -> list[Budget]:
        """List budgets in a workspace, inactive ones only on request."""
        queryset = Budget.objects.for_workspace(workspace_id).select_related('display_currency')
        if not include_inactive:
            queryset = queryset.filter(is_active=True)
        return list(queryset)

    @staticmethod
    def get(budget_id: int, workspace_id: int) -> Budget:
        """Get a budget by ID within a workspace."""
        budget = (
            Budget.objects.for_workspace(workspace_id).select_related('display_currency').filter(id=budget_id).first()
        )
        if not budget:
            raise BudgetNotFoundError()
        return budget

    @staticmethod
    @db_transaction.atomic
    def create(user, workspace_id: int, data: BudgetCreate) -> Budget:
        """Create a new budget with a validated cadence."""
        if Budget.objects.for_workspace(workspace_id).filter(name=data.name).exists():
            raise BudgetDuplicateNameError()

        weeks, anchor = BudgetService._validated_cadence_fields(data.cadence, data.cadence_weeks, data.cadence_anchor)

        display_currency = None
        if data.display_currency_code:
            display_currency = CurrencyCatalogService.get_enabled(workspace_id, data.display_currency_code)

        return Budget.objects.create(
            workspace_id=workspace_id,
            name=data.name,
            description=data.description,
            color=data.color,
            icon=data.icon,
            is_active=data.is_active,
            display_order=data.display_order,
            display_currency=display_currency,
            cadence=data.cadence,
            cadence_weeks=weeks,
            cadence_anchor=anchor,
            created_by=user,
            updated_by=user,
        )

    @staticmethod
    @db_transaction.atomic
    def update(user, workspace_id: int, budget_id: int, data: BudgetUpdate) -> Budget:
        """Update a budget. Cadence changes apply forward only — existing periods stay as they are."""
        budget = BudgetService.get(budget_id, workspace_id)

        if (
            data.name is not None
            and data.name != budget.name
            and Budget.objects.for_workspace(workspace_id).filter(name=data.name).exclude(id=budget_id).exists()
        ):
            raise BudgetDuplicateNameError()

        update_data = data.model_dump(exclude_unset=True)

        if 'display_currency_code' in update_data:
            code = update_data.pop('display_currency_code')
            budget.display_currency = (
                CurrencyCatalogService.get_enabled(workspace_id, code) if code is not None else None
            )

        cadence_touched = {'cadence', 'cadence_weeks', 'cadence_anchor'} & update_data.keys()
        if cadence_touched:
            cadence = update_data.pop('cadence', budget.cadence)
            weeks = update_data.pop('cadence_weeks', budget.cadence_weeks)
            anchor = update_data.pop('cadence_anchor', budget.cadence_anchor)
            weeks, anchor = BudgetService._validated_cadence_fields(cadence, weeks, anchor)
            budget.cadence = cadence
            budget.cadence_weeks = weeks
            budget.cadence_anchor = anchor

        for field, value in update_data.items():
            setattr(budget, field, value)

        budget.updated_by = user
        budget.save()
        return budget

    @staticmethod
    @db_transaction.atomic
    def set_archive_status(user, workspace_id: int, budget_id: int, data: BudgetArchive) -> Budget:
        """Archive or unarchive a budget (is_active flag)."""
        budget = BudgetService.get(budget_id, workspace_id)
        budget.is_active = data.is_active
        budget.updated_by = user
        budget.save()
        return budget

    @staticmethod
    @db_transaction.atomic
    def delete(workspace_id: int, budget_id: int) -> None:
        """Delete a budget; periods (and their CategoryBudgets from B4) cascade.

        B5 wires the delete-or-uncategorize prompt for transactions pointing at
        this budget's categories.
        """
        budget = BudgetService.get(budget_id, workspace_id)
        budget.delete()


class PeriodService:
    @staticmethod
    def compute_range(budget: Budget, target_date: date) -> tuple[date, date, str]:
        """Compute the (start, end, name) of the period covering target_date per the budget cadence.

        Raises NoPeriodForDateError for CUSTOM cadence — custom ranges are never derived.
        """
        if budget.cadence == Cadence.MONTHLY:
            start = target_date.replace(day=1)
            last_day = calendar.monthrange(target_date.year, target_date.month)[1]
            end = target_date.replace(day=last_day)
            return start, end, target_date.strftime('%B %Y')

        if budget.cadence == Cadence.WEEKS:
            span = budget.cadence_weeks * 7
            # Floor division keeps windows contiguous for dates before the anchor too.
            k = (target_date - budget.cadence_anchor).days // span
            start = budget.cadence_anchor + timedelta(days=k * span)
            end = start + timedelta(days=span - 1)
            return start, end, f'{start:%d %b} – {end:%d %b %Y}'

        raise NoPeriodForDateError()

    @staticmethod
    def get_or_create_for_date(user, budget: Budget, target_date: date) -> Period:
        """Return the period of `budget` covering `target_date`, materializing it lazily.

        The single entry point for period resolution (transactions, reports,
        "current period" in the UI). Concurrency-safe via the unique
        (budget, start_date) constraint.
        """
        if budget.cadence == Cadence.CUSTOM:
            period = budget.periods.filter(start_date__lte=target_date, end_date__gte=target_date).first()
            if not period:
                raise NoPeriodForDateError()
            return period

        start, end, name = PeriodService.compute_range(budget, target_date)

        period = budget.periods.filter(start_date=start).first()
        if period:
            return period

        try:
            with db_transaction.atomic():
                period = Period.objects.create(
                    budget=budget,
                    workspace_id=budget.workspace_id,
                    name=name,
                    start_date=start,
                    end_date=end,
                    is_custom=False,
                    created_by=user,
                    updated_by=user,
                )
                PeriodService.copy_forward(period)
                return period
        except IntegrityError:
            # A concurrent request created it first; the unique constraint guarantees one row.
            return budget.periods.get(start_date=start)

    @staticmethod
    def copy_forward(period: Period) -> None:
        """Pre-fill a freshly created period's plan from the budget's most recent earlier period.

        B4 copies CategoryBudget amounts from the budget's most recent earlier period.
        """

    @staticmethod
    def list(workspace_id: int, budget_id: int) -> list[Period]:
        """List all periods of a budget, newest first."""
        budget = BudgetService.get(budget_id, workspace_id)
        return list(budget.periods.all())

    @staticmethod
    def _get_period(workspace_id: int, budget_id: int, period_id: int) -> Period:
        period = Period.objects.for_workspace(workspace_id).filter(id=period_id, budget_id=budget_id).first()
        if not period:
            raise PeriodNotFoundError()
        return period

    @staticmethod
    def _check_overlap(budget: Budget, start_date: date, end_date: date, exclude_id: int | None = None) -> None:
        overlapping = budget.periods.filter(start_date__lte=end_date, end_date__gte=start_date)
        if exclude_id is not None:
            overlapping = overlapping.exclude(id=exclude_id)
        if overlapping.exists():
            raise PeriodOverlapError()

    @staticmethod
    @db_transaction.atomic
    def create_custom(user, workspace_id: int, budget_id: int, data: PeriodCreate) -> Period:
        """Create a custom period with an explicit, non-overlapping range."""
        budget = BudgetService.get(budget_id, workspace_id)
        PeriodService._check_overlap(budget, data.start_date, data.end_date)

        return Period.objects.create(
            budget=budget,
            workspace_id=workspace_id,
            name=data.name,
            start_date=data.start_date,
            end_date=data.end_date,
            is_custom=True,
            created_by=user,
            updated_by=user,
        )

    @staticmethod
    @db_transaction.atomic
    def update_custom(user, workspace_id: int, budget_id: int, period_id: int, data: PeriodUpdate) -> Period:
        """Update a custom period. Auto-created periods are immutable."""
        period = PeriodService._get_period(workspace_id, budget_id, period_id)
        if not period.is_custom:
            raise PeriodNotEditableError()

        new_start = data.start_date if data.start_date is not None else period.start_date
        new_end = data.end_date if data.end_date is not None else period.end_date
        if new_end < new_start:
            raise PeriodOverlapError('end_date must be on or after start_date', code='period_invalid_range')
        PeriodService._check_overlap(period.budget, new_start, new_end, exclude_id=period.id)

        if data.name is not None:
            period.name = data.name
        period.start_date = new_start
        period.end_date = new_end
        period.updated_by = user
        period.save()
        return period

    @staticmethod
    @db_transaction.atomic
    def delete(workspace_id: int, budget_id: int, period_id: int) -> None:
        """Delete a custom period. Auto-created periods cannot be deleted."""
        period = PeriodService._get_period(workspace_id, budget_id, period_id)
        if not period.is_custom:
            raise PeriodNotEditableError()
        period.delete()
