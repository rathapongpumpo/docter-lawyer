"""Field / file encryption shared with the web tier (docs/03-technical-spec.md §2.5).

AES-256-GCM. Blob layout: 0x01 ‖ key_version (1 byte) ‖ nonce (12) ‖ ciphertext ‖ tag (16). The AAD binds a value to
its row and column ("app.contracts.text_enc:<id>"). `key_version` 0 marks a value encrypted with a per-file key (DEK)
instead of a keyring key. Interoperability with web/lib/crypto.ts is pinned by db/seeds/crypto_vectors.json.
"""

import base64
import os
from dataclasses import dataclass

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

FORMAT = 0x01
DEK_VERSION = 0


@dataclass(frozen=True)
class Keyring:
    current: int
    keys: dict[int, bytes]


def _decode(v: str) -> bytes:
    return base64.b64decode(v.removeprefix("base64:"))


def parse_keyring(app_key: str | None, previous: str | None = None, current_version: int = 1) -> Keyring:
    if not app_key:
        raise RuntimeError("APP_KEY is not set")
    keys = {current_version: _decode(app_key)}
    for part in (previous or "").split(","):
        ver, _, key = part.strip().partition(":")
        if ver and key:
            keys[int(ver)] = _decode(key)
    for ver, key in keys.items():
        if len(key) != 32:
            raise RuntimeError(f"encryption key v{ver} must be 32 bytes")
    return Keyring(current_version, keys)


def keyring_from_env() -> Keyring:
    return parse_keyring(os.environ.get("APP_KEY"), os.environ.get("APP_KEY_PREVIOUS"),
                         int(os.environ.get("APP_KEY_VERSION", "1")))


def encrypt_raw(key: bytes, version: int, plaintext: bytes, aad: str, nonce: bytes | None = None) -> bytes:
    nonce = nonce or os.urandom(12)
    body = AESGCM(key).encrypt(nonce, plaintext, aad.encode())  # ciphertext ‖ tag
    return bytes([FORMAT, version]) + nonce + body


def decrypt_raw(key: bytes, blob: bytes, aad: str) -> bytes:
    if len(blob) < 2 + 12 + 16 or blob[0] != FORMAT:
        raise ValueError("unsupported ciphertext format")
    return AESGCM(key).decrypt(blob[2:14], blob[14:], aad.encode())


def encrypt_field(kr: Keyring, plaintext: bytes | str, aad: str, nonce: bytes | None = None) -> bytes:
    data = plaintext.encode() if isinstance(plaintext, str) else plaintext
    return encrypt_raw(kr.keys[kr.current], kr.current, data, aad, nonce)


def decrypt_field(kr: Keyring, blob: bytes, aad: str) -> bytes:
    key = kr.keys.get(blob[1])
    if key is None:
        raise ValueError(f"no key for version {blob[1]}")
    return decrypt_raw(key, blob, aad)


def unwrap_dek(kr: Keyring, wrapped: bytes, aad: str) -> bytes:
    return decrypt_field(kr, wrapped, aad)
