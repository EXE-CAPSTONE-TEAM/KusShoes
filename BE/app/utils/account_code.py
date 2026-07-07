from datetime import datetime


def generate_account_code(sequence_number: int) -> str:
    """
    Sinh mã tài khoản dạng KS-YYYY-NNNNN.
    Ví dụ: KS-2026-00142
    sequence_number lấy từ DB sequence: nextval('user_account_seq')
    """
    year = datetime.now().year
    return f"KS-{year}-{sequence_number:05d}"
