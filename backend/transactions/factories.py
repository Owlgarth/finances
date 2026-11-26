"""Factory Boy factories for the transactions app."""

from decimal import Decimal

import factory
from factory.django import DjangoModelFactory

from transactions.models import ReceiptCapture, Transaction, TransactionItem


class TransactionFactory(DjangoModelFactory):
    class Meta:
        model = Transaction

    account = factory.SubFactory('accounts.factories.AccountFactory')
    # Own currency defaults to the account's; account-less rows pass
    # account=None plus an explicit currency AND workspace.
    currency = factory.LazyAttribute(lambda obj: obj.account.currency)
    workspace = factory.LazyAttribute(lambda obj: obj.account.workspace)
    date = factory.Faker('date_this_year')
    description = factory.Faker('sentence')
    category = None
    amount = Decimal('100.00')
    type = 'expense'
    created_by = factory.SubFactory('common.tests.factories.UserFactory')
    updated_by = factory.SubFactory('common.tests.factories.UserFactory')


class TransactionItemFactory(DjangoModelFactory):
    class Meta:
        model = TransactionItem

    transaction = factory.SubFactory(TransactionFactory)
    position = factory.Sequence(lambda n: n)
    name = factory.Faker('word')
    quantity = Decimal('1')
    unit_price = Decimal('10.00')
    line_total = Decimal('10.00')
    # NULL category = inherit the transaction's category (read-side Coalesce).
    category = None
    # Factory rows are user rows by default; the service layer (later
    # tasks) creates remainder rows via coverage normalization. Tests that
    # need one pass is_remainder=True explicitly.
    is_remainder = False


class ReceiptCaptureFactory(DjangoModelFactory):
    """A queued receipt that still owns its file.

    state, error, result, merchant_key and transaction take the model defaults
    (queued, '', None, None, None). A handed-over row is file_key='' together
    with state=ReceiptCapture.SAVED; the DB constraints bind the two.
    """

    class Meta:
        model = ReceiptCapture

    workspace = factory.SubFactory('workspaces.factories.WorkspaceFactory')
    created_by = factory.SubFactory('common.tests.factories.UserFactory')
    file_key = factory.Sequence(lambda n: f'receipts/1/{n:032x}.jpg')
    filename = 'receipt.jpg'
    content_type = 'image/jpeg'
    size = 1024
