from datetime import datetime

from app.schemas.subscription import PaymentTransferDetails
from app.services.payment_details import (
    VIETNAM_TZ,
    customer_transfer_details,
    mask_account,
    payos_transfer_details,
)


class DummyInvoice:
    def __init__(self, payment_method="payos", gateway_metadata=None):
        self.payment_method = payment_method
        self.gateway_metadata = gateway_metadata


def test_mask_account():
    assert mask_account(None) is None
    assert mask_account("") is None
    assert mask_account("   ") is None
    assert mask_account("1234567890") == "••••7890"
    assert mask_account("9876") == "••••9876"
    assert mask_account("12") == "••••12"
    assert mask_account(" 00112233 ") == "••••2233"


def test_payos_transfer_details_full():
    payload = {
        "accountNumber": "99998888",
        "amount": 299000,
        "description": "KusShoes basic monthly",
        "reference": "FT24278912",
        "transactionDateTime": "2026-10-05 14:30:45",
        "currency": "VND",
        "paymentLinkId": "pl_12345abc",
        "code": "00",
        "desc": "success",
        "counterAccountBankId": "970422",
        "counterAccountBankName": "MBBank",
        "counterAccountName": "NGUYEN VAN A",
        "counterAccountNumber": "0123456789",
        "virtualAccountName": "KUSSHOES BILLING",
        "virtualAccountNumber": "VA123456",
    }
    invoice = DummyInvoice(payment_method="payos", gateway_metadata={"payos": payload})

    details = payos_transfer_details(invoice)
    assert details is not None
    assert details["transferred_at"] == datetime(2026, 10, 5, 14, 30, 45, tzinfo=VIETNAM_TZ)
    assert details["sender_name"] == "NGUYEN VAN A"
    assert details["sender_account_number"] == "0123456789"
    assert details["sender_bank_id"] == "970422"
    assert details["sender_bank_name"] == "MBBank"
    assert details["receiver_account_number"] == "99998888"
    assert details["virtual_account_name"] == "KUSSHOES BILLING"
    assert details["virtual_account_number"] == "VA123456"
    assert details["bank_reference"] == "FT24278912"
    assert details["payment_link_id"] == "pl_12345abc"
    assert details["transfer_description"] == "KusShoes basic monthly"
    assert details["currency"] == "VND"

    # Schema validation
    schema_obj = PaymentTransferDetails(**details)
    assert schema_obj.sender_name == "NGUYEN VAN A"

    # Customer masking check
    cust_details = customer_transfer_details(invoice)
    assert cust_details is not None
    assert cust_details["sender_name"] == "NGUYEN VAN A"
    assert cust_details["sender_account_number"] == "••••6789"
    assert cust_details["receiver_account_number"] == "99998888"


def test_payos_transfer_details_null_or_empty_counter():
    payload = {
        "accountNumber": "99998888",
        "amount": 299000,
        "description": "KusShoes basic monthly",
        "reference": "FT24278912",
        "transactionDateTime": "2026-10-05 14:30:45",
        "currency": "VND",
        "counterAccountBankId": None,
        "counterAccountBankName": "",
        "counterAccountName": "   ",
        "counterAccountNumber": None,
    }
    invoice = DummyInvoice(payment_method="payos", gateway_metadata={"payos": payload})

    details = payos_transfer_details(invoice)
    assert details is not None
    assert details["sender_name"] is None
    assert details["sender_account_number"] is None
    assert details["sender_bank_id"] is None
    assert details["sender_bank_name"] is None
    assert details["receiver_account_number"] == "99998888"

    cust_details = customer_transfer_details(invoice)
    assert cust_details["sender_account_number"] is None


def test_payos_transfer_details_missing_transaction_date_time():
    payload = {
        "reference": "FT999",
        "counterAccountName": "TEST USER",
    }
    invoice = DummyInvoice(payment_method="payos", gateway_metadata={"payos": payload})
    details = payos_transfer_details(invoice)
    assert details is not None
    assert details["transferred_at"] is None
    assert details["sender_name"] == "TEST USER"


def test_payos_transfer_details_malformed_datetime():
    payload = {
        "reference": "FT999",
        "transactionDateTime": "invalid-datetime-string",
    }
    invoice = DummyInvoice(payment_method="payos", gateway_metadata={"payos": payload})
    # Must never raise an exception, logs warning and returns None
    details = payos_transfer_details(invoice)
    assert details is not None
    assert details["transferred_at"] is None


def test_payos_transfer_details_non_payos_or_missing_metadata():
    inv_momo = DummyInvoice(payment_method="momo", gateway_metadata={"momo": {}})
    assert payos_transfer_details(inv_momo) is None
    assert customer_transfer_details(inv_momo) is None

    inv_none_meta = DummyInvoice(payment_method="payos", gateway_metadata=None)
    assert payos_transfer_details(inv_none_meta) is None

    inv_empty_meta = DummyInvoice(payment_method="payos", gateway_metadata={})
    assert payos_transfer_details(inv_empty_meta) is None

    assert payos_transfer_details(None) is None
