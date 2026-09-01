from django.db import models
from django.utils.translation import gettext as _


class WorkspaceScopedQuerySet(models.QuerySet):
    """QuerySet with for_workspace() filtering by direct workspace_id FK."""

    def for_workspace(self, workspace_id: int):
        if not workspace_id:
            raise ValueError(
                _('workspace_id is required for %(model)s.for_workspace(), got %(value)r')
                % {'model': self.model.__name__, 'value': workspace_id}
            )
        return self.filter(workspace_id=workspace_id)
