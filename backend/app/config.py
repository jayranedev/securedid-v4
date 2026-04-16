from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:securedid@localhost:5432/securedid"

    # JWT
    JWT_SECRET: str = "change-this-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60

    # CORS
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000"]

    # Nonce TTL in seconds
    NONCE_TTL_SECONDS: int = 30

    # Shamir secret sharing
    SHAMIR_SHARES: int = 5
    SHAMIR_THRESHOLD: int = 3

    # Credential expiry in days
    CREDENTIAL_EXPIRY_DAYS: int = 365

    # Anomaly detection: max auth attempts from different IPs within this window (seconds)
    ANOMALY_WINDOW_SECONDS: int = 300

    # One-time secret required to call POST /api/admin/create-panelist
    SUPER_ADMIN_SECRET: str = "change-this-super-admin-secret"

    # v4: IPFS / Pinata (optional — leave empty to skip IPFS uploads)
    PINATA_API_KEY: str = ""
    PINATA_SECRET_KEY: str = ""
    IPFS_GATEWAY: str = "https://gateway.pinata.cloud/ipfs"


settings = Settings()
