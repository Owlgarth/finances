"""Custom exceptions for categories app."""

from common.exceptions import NotFoundError, ValidationError


class CategoryNotFoundError(NotFoundError):
    default_message = 'Category not found'
    default_code = 'not_found'


class CategoryDuplicateNameError(ValidationError):
    default_message = 'A category with this name already exists in this budget period.'
    default_code = 'duplicate_name'
