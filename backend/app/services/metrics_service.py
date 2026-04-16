"""
Timing wrapper used by every service.

Usage:
    result = await record(db, "csv_match", some_coroutine, roll_number="21CE001")

The metric is added to the session — it commits with the parent transaction.
If recording itself fails (shouldn't) the main operation still succeeds.
"""
import time
import logging
from typing import Any, Awaitable

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.metrics import Metric

logger = logging.getLogger(__name__)


async def record(
    db: AsyncSession,
    operation: str,
    coro: Awaitable[Any],
    **meta: Any,
) -> Any:
    """Await *coro*, persist a Metric row, return the result."""
    start = time.perf_counter()
    exc_info: Exception | None = None
    try:
        result = await coro
        outcome = "SUCCESS"
        return result
    except Exception as exc:
        outcome = "FAILURE"
        exc_info = exc
        raise
    finally:
        duration_ms = (time.perf_counter() - start) * 1000
        try:
            db.add(
                Metric(
                    operation=operation,
                    duration_ms=round(duration_ms, 3),
                    result=outcome,
                    meta={**meta, "error": str(exc_info)} if exc_info else (meta or None),
                )
            )
        except Exception:
            logger.warning("Failed to record metric for %s — non-fatal", operation)
