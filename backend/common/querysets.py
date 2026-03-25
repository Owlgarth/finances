from django.db import models


class WorkspaceScopedQuerySet(models.QuerySet):
    """QuerySet with for_workspace() filtering by direct workspace_id FK."""

    def for_workspace(self, workspace_id: int):
        if not workspace_id:
            raise ValueError(
                f'workspace_id is required for {self.model.__name__}.for_workspace(), got {workspace_id!r}'
            )
        return self.filter(workspace_id=workspace_id)
