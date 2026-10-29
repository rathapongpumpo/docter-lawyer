"""Liveness and readiness probes (no auth)."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

router = APIRouter()


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/readyz")
async def readyz(request: Request) -> JSONResponse:
    checks = {"db": "ok"}
    try:
        async with request.app.state.pool.connection(timeout=2) as conn:
            await conn.execute("SELECT 1")
    except Exception:
        checks["db"] = "error"
    ok = all(v == "ok" for v in checks.values())
    return JSONResponse({"status": "ok" if ok else "error", **checks}, status_code=200 if ok else 503)
