from django.db import models


class WorkspaceScopedQuerySet(models.QuerySet):
    """
    Adds for_workspace() to any model that declares WORKSPACE_FILTER.
    WORKSPACE_FILTER is a Django ORM lookup path string ending in workspace_id.
    """

    def for_workspace(self, workspace_id: int):
        if not workspace_id:
            raise ValueError(
                f'workspace_id is required for {self.model.__name__}.for_workspace(), got {workspace_id!r}'
            )
        filter_path = getattr(self.model, 'WORKSPACE_FILTER', None)
        if not filter_path:
            raise ValueError(f'{self.model.__name__} has no WORKSPACE_FILTER defined')
        return self.filter(**{filter_path: workspace_id})
