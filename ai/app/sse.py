"""Server-Sent Events framing for the chat protocol (docs/03-technical-spec.md §3.4.2)."""

import json
from typing import Any

HEARTBEAT = ": ping\n\n"

SSE_HEADERS = {
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
    "Connection": "keep-alive",
}


def sse_event(event: str, data: Any) -> str:
    """`event: <name>\\ndata: <single-line JSON>\\n\\n` — JSON never contains a raw newline."""
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    return f"event: {event}\ndata: {payload}\n\n"
