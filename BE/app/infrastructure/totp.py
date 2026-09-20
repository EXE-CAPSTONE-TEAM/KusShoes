"""TOTP (RFC 6238) implemented on stdlib only — no new dependency for a
handful of HMAC-SHA1 calls. Compatible with Google/Microsoft Authenticator."""
import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote

_DIGITS = 6
_PERIOD = 30
_ISSUER = "KusShoes"


def generate_secret() -> str:
    """Base32 secret, no padding — what authenticator apps expect."""
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def provisioning_uri(*, secret: str, account_email: str) -> str:
    label = quote(f"{_ISSUER}:{account_email}")
    return (
        f"otpauth://totp/{label}?secret={secret}&issuer={quote(_ISSUER)}"
        f"&digits={_DIGITS}&period={_PERIOD}&algorithm=SHA1"
    )


def _hotp(secret: str, counter: int) -> str:
    key = base64.b32decode(_pad(secret))
    msg = struct.pack(">Q", counter)
    digest = hmac.new(key, msg, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    truncated = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(truncated % (10**_DIGITS)).zfill(_DIGITS)


def _pad(secret: str) -> str:
    return secret + "=" * (-len(secret) % 8)


def verify_code(secret: str, code: str, *, at: float | None = None, window: int = 1) -> bool:
    """Accepts the current 30s step plus `window` steps of clock drift either way."""
    if not code or not code.isdigit():
        return False
    now = at if at is not None else time.time()
    counter = int(now // _PERIOD)
    for offset in range(-window, window + 1):
        if hmac.compare_digest(_hotp(secret, counter + offset), code):
            return True
    return False
