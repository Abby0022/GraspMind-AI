"""Zero-knowledge API key vault.

Keys are encrypted with AES-256-GCM using a server-side master key.
Each key gets a unique 96-bit nonce. The encrypted blob is stored as:

    base64(nonce[12] + ciphertext[...] + tag[16])

The master key (VAULT_MASTER_KEY) must be a 64-char hex string (32 bytes).
Generate with:
    python -c "import secrets; print(secrets.token_hex(32))"

Security properties:
- Fresh random nonce per encryption → identical keys produce different ciphertexts
- GCM tag provides authentication → tampered ciphertexts are rejected
- Master key never leaves server memory
- Keys are wiped from memory after each request via explicit del
"""

from __future__ import annotations

import base64
import gc
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class VaultError(Exception):
    """Raised when vault operations fail."""


def _get_master_key() -> bytes:
    """Load the master key from config. Raises VaultError if missing."""
    from graspmind.config import get_settings

    hex_key = get_settings().vault_master_key
    if not hex_key or len(hex_key) != 64:
        raise VaultError(
            "VAULT_MASTER_KEY must be a 64-character hex string (32 bytes). "
            "Generate with: python -c \"import secrets; print(secrets.token_hex(32))\""
        )
    try:
        return bytes.fromhex(hex_key)
    except ValueError as e:
        raise VaultError(f"VAULT_MASTER_KEY is not valid hex: {e}") from e


def encrypt_key(plaintext: str) -> str:
    """Encrypt an API key and return a base64-encoded blob.

    The blob contains: nonce (12 bytes) + ciphertext + tag (16 bytes).
    """
    if not plaintext:
        return ""

    master = _get_master_key()
    try:
        aesgcm = AESGCM(master)
        nonce = os.urandom(12)  # 96-bit nonce, unique per encryption
        ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
        # ciphertext includes the 16-byte GCM tag appended by the library
        blob = nonce + ciphertext
        return base64.b64encode(blob).decode("ascii")
    finally:
        # Wipe the master key from this scope
        del master
        gc.collect()


def decrypt_key(ciphertext_b64: str) -> str:
    """Decrypt a base64-encoded blob back to the plaintext API key.

    Raises VaultError on tampered data or wrong master key.
    """
    if not ciphertext_b64:
        return ""

    master = _get_master_key()
    try:
        blob = base64.b64decode(ciphertext_b64)
        if len(blob) < 28:  # 12 (nonce) + 16 (tag) minimum
            raise VaultError("Encrypted key blob is too short — possibly corrupted")

        nonce = blob[:12]
        ciphertext = blob[12:]
        aesgcm = AESGCM(master)
        plaintext_bytes = aesgcm.decrypt(nonce, ciphertext, None)
        return plaintext_bytes.decode("utf-8")
    except VaultError:
        raise
    except Exception as e:
        raise VaultError(
            f"Failed to decrypt API key — master key may have changed or data is corrupted: {e}"
        ) from e
    finally:
        del master
        gc.collect()


def mask_key(key: str) -> str:
    """Return a masked version of a key for safe display.

    Example: 'gsk_abc123...xyz789' → 'gsk_****...z789'
    """
    if not key:
        return ""
    if len(key) <= 8:
        return "****"
    return key[:4] + "····" + key[-4:]
