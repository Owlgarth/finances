"""Factory Boy factories for the core app."""

from datetime import date

import factory
from factory.django import DjangoModelFactory

from core.models import LegalDocument


class LegalDocumentFactory(DjangoModelFactory):
    class Meta:
        model = LegalDocument

    doc_type = 'terms_of_service'
    version = '1.0'
    effective_date = factory.LazyFunction(lambda: date.today())
    content = factory.Faker('text')
    is_active = True
