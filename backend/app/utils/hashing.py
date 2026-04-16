"""Password and secret-key hashing helpers."""
import hashlib
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def hash_secret_key(secret_key: str) -> str:
    """SHA-256 hash used for student secret keys stored in CSV records."""
    return hashlib.sha256(secret_key.encode()).hexdigest()


def verify_secret_key(plain: str, stored_hash: str) -> bool:
    return hashlib.sha256(plain.encode()).hexdigest() == stored_hash
