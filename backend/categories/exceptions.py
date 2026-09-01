"""Custom exceptions for categories app."""

from django.utils.translation import gettext_lazy

from common.exceptions import NotFoundError, ValidationError


class CategoryNotFoundError(NotFoundError):
    default_message = gettext_lazy('Category not found')
    default_code = 'not_found'


class CategoryDuplicateNameError(ValidationError):
    default_message = gettext_lazy('A category with this name already exists in this budget period.')
    default_code = 'duplicate_name'


class CategoryMergeSelfError(ValidationError):
    default_message = gettext_lazy('A category cannot be merged into itself.')
    default_code = 'merge_self'
