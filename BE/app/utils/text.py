import re
import unicodedata


def strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value.replace("đ", "d").replace("Đ", "D"))
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")


def ascii_slug(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]+", "", strip_accents(value)).lower() or "khach"


def short_name(first_name: str, last_name: str) -> str:
    """BR-88: 'Nguyễn Văn A' -> 'Nguyễn V. A'."""
    parts = last_name.split()
    if not parts:
        return first_name
    initials = [f"{p[0]}." for p in parts[:-1]]
    return " ".join([first_name, *initials, parts[-1]])


def mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    if not domain:
        return "***"
    return f"{local[:2]}***@{domain}"


def format_vnd(amount: int) -> str:
    return f"{amount:,}".replace(",", ".") + "đ"
