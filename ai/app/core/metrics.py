"""Prometheus metrics of the AI service. Labels are route templates and status classes only, never user data."""

import hmac
import os
import time
from collections.abc import Awaitable, Callable

from fastapi import Request, Response
from prometheus_client import CONTENT_TYPE_LATEST, CollectorRegistry, Counter, Histogram, generate_latest

REGISTRY = CollectorRegistry()
REQUESTS = Counter("lc_ai_http_requests_total", "HTTP requests by route and status", ["route", "status"],
                   registry=REGISTRY)
LATENCY = Histogram("lc_ai_http_duration_seconds", "Time until the response starts (streams: first byte)", ["route"],
                    buckets=[0.02, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 15, 60], registry=REGISTRY)
_SKIP = {"/metrics", "/healthz", "/readyz"}


async def metrics_middleware(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
    started = time.perf_counter()
    response = await call_next(request)
    route = request.scope.get("route")
    path = getattr(route, "path", None) or "unmatched"
    if path not in _SKIP:
        REQUESTS.labels(path, str(response.status_code)).inc()
        LATENCY.labels(path).observe(time.perf_counter() - started)
    return response


def scrape(request: Request) -> Response:
    """Closed unless METRICS_TOKEN is set; then it needs `Authorization: Bearer <token>`."""
    token = os.environ.get("METRICS_TOKEN", "")
    if not token:
        return Response("not found", status_code=404)
    given = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    if not hmac.compare_digest(given.encode(), token.encode()):
        return Response("unauthorized", status_code=401)
    return Response(generate_latest(REGISTRY), media_type=CONTENT_TYPE_LATEST)
