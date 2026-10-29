"""FastAPI entrypoint for the AI service."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.answer.extractive import ExtractiveAnswerer
from app.api import router
from app.core.config import get_settings
from app.core.db import create_pool
from app.core.logging import configure_logging, log
from app.core.metrics import metrics_middleware, scrape
from app.rag.embed import Embedder
from app.rag.retrieve import Retriever
from app.repositories.kb_repo import KbRepository


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    configure_logging(settings.log_level)
    if getattr(app.state, "pool", None) is None:
        app.state.pool = create_pool(settings)
        await app.state.pool.open(wait=False)
    if getattr(app.state, "answerer", None) is None:
        pool = app.state.pool
        retriever = Retriever(pool, Embedder(settings.embed_url, settings.embed_dim), settings.rag_topk_dense,
                              settings.rag_topk_lexical, settings.rag_rrf_k)
        app.state.answerer = ExtractiveAnswerer(retriever, KbRepository(pool), include_drafts=settings.kb_serve_drafts)
    log.info("ai_started", extra={"env": settings.app_env, "kb_serve_drafts": settings.kb_serve_drafts})
    try:
        yield
    finally:
        await app.state.pool.close()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="legal-consult ai", version="0.1.0", lifespan=lifespan,
                  openapi_url=None if settings.app_env == "prod" else "/openapi.json")

    @app.exception_handler(HTTPException)
    async def http_error(_: Request, exc: HTTPException) -> JSONResponse:
        detail = exc.detail if isinstance(exc.detail, dict) else {"code": "error", "message": str(exc.detail)}
        return JSONResponse({"error": detail}, status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        fields = [".".join(str(p) for p in e.get("loc", [])) for e in exc.errors()]
        return JSONResponse({"error": {"code": "validation_error", "message": "invalid request",
                                       "fields": fields}}, status_code=422)

    app.middleware("http")(metrics_middleware)
    app.add_api_route("/metrics", scrape, methods=["GET"], include_in_schema=False)
    app.include_router(router)
    return app


app = create_app()
