from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import engine
from app.models import Base

# Import all routers
from app.routers import (
    admin,
    registration,
    auth,
    did,
    credentials,
    revocation,
    governance,
    data_updates,
    metrics,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all tables on startup (dev convenience; production uses Alembic)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(
    title="SecureDID v3",
    description="Decentralized Identity Platform for Educational Institutions",
    version="3.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next) -> Response:
    """v4 — Inject security headers on every response."""
    response: Response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    # Tight CSP — allow only same origin + localhost frontend for iframes/forms
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'none'; "
        "object-src 'none'; "
        "frame-ancestors 'none';"
    )
    return response

# Register routers
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])
app.include_router(registration.router, prefix="/api", tags=["Registration"])
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(did.router, prefix="/api", tags=["DID"])
app.include_router(credentials.router, prefix="/api", tags=["Credentials"])
app.include_router(revocation.router, prefix="/api", tags=["Revocation"])
app.include_router(governance.router, prefix="/api/governance", tags=["Governance"])
app.include_router(data_updates.router, prefix="/api", tags=["Data Updates"])
app.include_router(metrics.router, prefix="/api", tags=["Metrics"])


@app.get("/api/health", tags=["Health"])
async def health_check():
    return {"status": "ok", "version": "3.0.0"}
