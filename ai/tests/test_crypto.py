"""The web tier (Node) and this service must read each other's encrypted values (spec §2.5)."""

import base64
import json
import os
from pathlib import Path

import pytest

from app.core.crypto import Keyring, decrypt_field, encrypt_field, parse_keyring

_DEFAULT = Path(__file__).resolve().parents[2] / "db" / "seeds" / "crypto_vectors.json"
VECTORS = Path(os.environ.get("CRYPTO_VECTORS") or _DEFAULT)


def _vectors():
    if not VECTORS.exists():  # the ai image mounts only ai/ — the vectors are checked when the repo is available
        pytest.skip("db/seeds/crypto_vectors.json not mounted (set CRYPTO_VECTORS)")
    return json.loads(VECTORS.read_text())["vectors"]


def test_decrypts_what_node_encrypted_and_produces_identical_bytes():
    for v in _vectors():
        kr = Keyring(v["key_version"], {v["key_version"]: base64.b64decode(v["key_base64"])})
        blob = bytes.fromhex(v["ciphertext_hex"])
        assert decrypt_field(kr, blob, v["aad"]).decode() == v["plaintext"]
        assert encrypt_field(kr, v["plaintext"], v["aad"], nonce=bytes.fromhex(v["nonce_hex"])) == blob


def test_aad_binds_the_value_to_its_row_and_tampering_is_detected():
    kr = parse_keyring(base64.b64encode(b"k" * 32).decode())
    blob = encrypt_field(kr, "secret", "app.contracts.text_enc:1")
    with pytest.raises(Exception):  # noqa: B017 — cryptography raises InvalidTag
        decrypt_field(kr, blob, "app.contracts.text_enc:2")
    bad = bytearray(blob)
    bad[20] ^= 1
    with pytest.raises(Exception):  # noqa: B017
        decrypt_field(kr, bytes(bad), "app.contracts.text_enc:1")


def test_previous_keys_still_decrypt_after_rotation():
    old = parse_keyring(base64.b64encode(b"a" * 32).decode(), current_version=1)
    blob = encrypt_field(old, "legacy", "x:1")
    new = parse_keyring(base64.b64encode(b"b" * 32).decode(), f"1:{base64.b64encode(b'a' * 32).decode()}", 2)
    assert decrypt_field(new, blob, "x:1") == b"legacy"


def test_rejects_short_keys():
    with pytest.raises(RuntimeError):
        parse_keyring(base64.b64encode(b"short").decode())
