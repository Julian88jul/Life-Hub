"""Passwort-Hashing und signierte Tokens, nur mit der Standardbibliothek."""
import base64
import hashlib
import hmac
import json
import os
import secrets
import time

TOKEN_TTL = 30 * 24 * 3600  # 30 Tage

_SECRET = os.getenv("SECRET_KEY")
if not _SECRET:
    # Ohne festen Schlüssel sind Logins nach jedem Neustart ungültig (und bei mehreren Instanzen kaputt).
    print("WARNUNG: SECRET_KEY fehlt, es wird ein temporärer Schlüssel verwendet.")
    _SECRET = secrets.token_hex(32)
_KEY = _SECRET.encode()


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, salt_hex, digest_hex = stored.split("$")
        if scheme != "scrypt":
            return False
        digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1, dklen=32)
        return hmac.compare_digest(digest.hex(), digest_hex)
    except ValueError:
        return False


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def make_token(user_id: int) -> str:
    payload = _b64(json.dumps({"uid": user_id, "exp": int(time.time()) + TOKEN_TTL}).encode())
    sig = _b64(hmac.new(_KEY, payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{sig}"


def verify_token(token: str) -> int | None:
    try:
        payload, sig = token.split(".")
        expected = _b64(hmac.new(_KEY, payload.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            return None
        data = json.loads(_unb64(payload))
        if data["exp"] < time.time():
            return None
        return int(data["uid"])
    except (ValueError, KeyError, TypeError):
        return None
