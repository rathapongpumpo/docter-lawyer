"""Job runner: `python -m worker` (runs as DB role lc_worker).

Claims one job at a time from app.jobs with FOR UPDATE SKIP LOCKED (docs/03-technical-spec.md §2.3.8), runs its
handler in the same transaction, and retries failures with exponential backoff up to max_attempts.
"""

import os
import signal
import socket
import time
from typing import Any

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.core.config import get_settings
from app.core.logging import configure_logging, log
from worker.jobs import HANDLERS, SCHEDULE

POLL_SECONDS = float(os.environ.get("WORKER_POLL_SECONDS", "2"))
WORKER_ID = f"{socket.gethostname()}:{os.getpid()}"
_stop = False


def _handle_signal(*_: Any) -> None:
    global _stop
    _stop = True


CLAIM = """UPDATE app.jobs SET status = 'running', locked_by = %s, locked_at = now(), attempts = attempts + 1,
                               updated_at = now()
           WHERE id = (SELECT id FROM app.jobs WHERE status = 'queued' AND run_after <= now() AND type = ANY(%s)
                       ORDER BY priority, run_after FOR UPDATE SKIP LOCKED LIMIT 1)
           RETURNING id, type, payload, attempts, max_attempts"""


ENQUEUE_DUE = """INSERT INTO app.jobs (type, dedupe_key, priority)
                 SELECT %(type)s, %(key)s, 8
                 WHERE NOT EXISTS (SELECT 1 FROM app.jobs WHERE dedupe_key = %(key)s)"""


def enqueue_due(conn: psycopg.Connection) -> int:
    """One job per type per interval bucket; the dedupe key makes concurrent workers safe."""
    now = int(time.time())
    queued = 0
    with conn.transaction():
        for job_type, interval in SCHEDULE.items():
            queued += conn.execute(ENQUEUE_DUE, {"type": job_type, "key": f"sched:{job_type}:{now // interval}"}).rowcount
    return queued


def run_once(conn: psycopg.Connection) -> bool:
    """Claim and run one job. Returns False when the queue is empty."""
    with conn.transaction():
        job = conn.execute(CLAIM, (WORKER_ID, list(HANDLERS))).fetchone()
    if not job:
        return False
    started = time.monotonic()
    try:
        with conn.transaction():
            result = HANDLERS[job["type"]](conn, job["payload"])
            conn.execute("""UPDATE app.jobs SET status = 'done', result = %s, finished_at = now(), updated_at = now(),
                                   last_error = NULL WHERE id = %s""", (Jsonb(result), job["id"]))
        log.info("job_done", extra={"job_id": job["id"], "type": job["type"], "ms": int((time.monotonic() - started) * 1000),
                                    **{k: v for k, v in result.items() if isinstance(v, (int, bool))}})
    except Exception as exc:
        final = job["attempts"] >= job["max_attempts"]
        with conn.transaction():
            conn.execute("""UPDATE app.jobs SET status = %s, last_error = %s, updated_at = now(),
                                   run_after = now() + make_interval(secs => 30 * power(2, attempts - 1)),
                                   finished_at = CASE WHEN %s THEN now() END
                            WHERE id = %s""",
                         ("dead" if final else "queued", f"{type(exc).__name__}: {exc}"[:500], final, job["id"]))
        log.exception("job_failed", extra={"job_id": job["id"], "type": job["type"], "final": final})
    return True


def main() -> None:
    settings = get_settings()
    configure_logging(settings.log_level)
    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)
    log.info("worker_started", extra={"worker": WORKER_ID, "types": list(HANDLERS)})
    while not _stop:
        try:
            with psycopg.connect(settings.db_conninfo.replace("lc-ai", "lc-worker"), row_factory=dict_row) as conn:
                last_schedule = 0.0
                while not _stop:
                    if time.monotonic() - last_schedule > 60:
                        enqueue_due(conn)
                        last_schedule = time.monotonic()
                    if not run_once(conn):
                        time.sleep(POLL_SECONDS)
        except psycopg.OperationalError:
            log.exception("worker_db_unavailable")
            time.sleep(5)
    log.info("worker_stopped", extra={"worker": WORKER_ID})


if __name__ == "__main__":
    main()
