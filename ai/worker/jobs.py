"""Job handlers for the worker (docs/03-technical-spec.md §1.1 `worker`). Each takes (conn, payload) → result dict."""

import json
import os
import time
from collections.abc import Callable
from typing import Any

from psycopg import Connection
from psycopg.types.json import Jsonb

from app.contracts import review as contract_review
from app.contracts.extract import UnsupportedFile
from app.contracts.extract import extract as extract_text
from app.core import mail, storage
from app.core.crypto import decrypt_field, decrypt_raw, encrypt_field, keyring_from_env, unwrap_dek
from app.core.config import get_settings
from app.core.logging import log
from app.guardrails.pii import mask_pii
from app.kb import law_import, rebuild
from app.rag.embed import Embedder

_STATUS = "(CASE WHEN {t}.status = 'published' THEN 'published' ELSE {t}.status::text END)"

# content type → UPDATE that makes kb.chunks follow the source's status (and dates for statutes).
# Chunk text and embeddings do not change here: the importer/ingest builds them; publishing only flips visibility.
_REINDEX: dict[str, str] = {
    "article": f"""UPDATE kb.chunks c SET is_published = (av.status = 'published'),
                          metadata = jsonb_set(c.metadata, '{{status}}', to_jsonb({_STATUS.format(t='av')}))
                   FROM kb.article_versions av
                   WHERE av.id = %(id)s AND c.source_type = 'article' AND c.source_id = av.article_id
                     AND c.source_version = av.id""",
    "guide": f"""UPDATE kb.chunks c SET is_published = (g.status = 'published'),
                        metadata = jsonb_set(c.metadata, '{{status}}', to_jsonb({_STATUS.format(t='g')}))
                 FROM kb.guides g WHERE g.id = %(id)s AND c.source_type = 'guide' AND c.source_id = g.id""",
    "template": f"""UPDATE kb.chunks c SET is_published = (t.status = 'published'),
                           metadata = jsonb_set(c.metadata, '{{status}}', to_jsonb({_STATUS.format(t='t')}))
                    FROM kb.templates t WHERE t.id = %(id)s AND c.source_type = 'template' AND c.source_id = t.id""",
    "glossary": f"""UPDATE kb.chunks c SET is_published = (g.status = 'published'),
                           metadata = jsonb_set(c.metadata, '{{status}}', to_jsonb({_STATUS.format(t='g')}))
                    FROM kb.glossary_terms g WHERE g.id = %(id)s AND c.source_type = 'glossary' AND c.source_id = g.id""",
    "law_version": f"""UPDATE kb.chunks c SET is_published = (v.status = 'published'), effective_from = s.effective_from,
                              effective_to = s.effective_to,
                              metadata = jsonb_set(c.metadata, '{{status}}', to_jsonb({_STATUS.format(t='v')}))
                       FROM kb.law_sections s JOIN kb.law_versions v ON v.id = s.law_version_id
                       WHERE v.id = %(id)s AND c.source_type = 'law_section' AND c.source_id = s.id""",
}


# After a decision, every chunk of the type must agree with its row: archived versions/rows are erased from search (an
# approved revision archives the one it replaces), drafts stay unpublished, published ones are visible.
_SWEEP: dict[str, list[str]] = {
    "article": ["""DELETE FROM kb.chunks c USING kb.article_versions av
                   WHERE c.source_type = 'article' AND c.source_id = av.article_id AND c.source_version = av.id AND av.status = 'archived'""",
                """UPDATE kb.chunks c SET is_published = (av.status = 'published')
                   FROM kb.article_versions av WHERE c.source_type = 'article' AND c.source_id = av.article_id
                     AND c.source_version = av.id AND c.is_published <> (av.status = 'published')"""],
    "guide": ["DELETE FROM kb.chunks c USING kb.guides g WHERE c.source_type = 'guide' AND c.source_id = g.id AND g.status = 'archived'",
              """UPDATE kb.chunks c SET is_published = (g.status = 'published') FROM kb.guides g
                 WHERE c.source_type = 'guide' AND c.source_id = g.id AND c.is_published <> (g.status = 'published')"""],
    "template": ["DELETE FROM kb.chunks c USING kb.templates t WHERE c.source_type = 'template' AND c.source_id = t.id AND t.status = 'archived'",
                 """UPDATE kb.chunks c SET is_published = (t.status = 'published') FROM kb.templates t
                    WHERE c.source_type = 'template' AND c.source_id = t.id AND c.is_published <> (t.status = 'published')"""],
    "law_version": ["""UPDATE kb.chunks c SET effective_to = s.effective_to, effective_from = s.effective_from
                     FROM kb.law_sections s WHERE c.source_type = 'law_section' AND c.source_id = s.id
                       AND (c.effective_to IS DISTINCT FROM s.effective_to OR c.effective_from IS DISTINCT FROM s.effective_from)"""],
    "glossary": ["DELETE FROM kb.chunks c USING kb.glossary_terms g WHERE c.source_type = 'glossary' AND c.source_id = g.id AND g.status = 'archived'",
                 """UPDATE kb.chunks c SET is_published = (g.status = 'published') FROM kb.glossary_terms g
                    WHERE c.source_type = 'glossary' AND c.source_id = g.id AND c.is_published <> (g.status = 'published')"""],
}


def reindex(conn: Connection, payload: dict[str, Any]) -> dict[str, Any]:
    kind, content_id = payload.get("content_type"), payload.get("content_id")
    if kind not in _REINDEX or not isinstance(content_id, int):
        raise ValueError(f"bad reindex payload: {payload}")
    cur = conn.execute(_REINDEX[kind], {"id": content_id})
    swept = sum(conn.execute(q).rowcount for q in _SWEEP.get(kind, []))
    # 0 rows means the approved version has no chunks yet (e.g. edited in the CMS) → needs a rebuild with embeddings
    return {"chunks_updated": cur.rowcount, "swept": swept, "needs_rebuild": cur.rowcount == 0}


def ingest_law(conn: Connection, payload: dict[str, Any]) -> dict[str, Any]:
    """Parse an uploaded statute, or save the parsed (and corrected) result as a draft version — see app/kb/law_import.py."""
    settings = get_settings()
    return law_import.ingest_law(conn, Embedder(os.environ.get("EMBED_URL", "http://embed-m3:8080"), settings.embed_dim), payload)


def ingest_content(conn: Connection, payload: dict[str, Any]) -> dict[str, Any]:
    """Build the search chunks (with embeddings) of content edited in the back-office."""
    kind, content_id = payload.get("content_type"), payload.get("content_id")
    if kind not in rebuild.TYPES or not isinstance(content_id, int):
        raise ValueError(f"bad ingest_content payload: {payload}")
    settings = get_settings()
    return rebuild.rebuild_chunks(conn, Embedder(os.environ.get("EMBED_URL", "http://embed-m3:8080"), settings.embed_dim), kind, content_id)


def _audit(conn: Connection, action: str, target_type: str, target_id: str | None, meta: dict[str, Any]) -> None:
    conn.execute("""INSERT INTO app.audit_log (actor_role, action, target_type, target_id, meta)
                    VALUES ('system', %s, %s, %s, %s)""", (action, target_type, target_id, Jsonb(meta)))


def purge_guest_data(conn: Connection, payload: dict[str, Any]) -> dict[str, Any]:
    """Delete guest (anonymous) users idle for GUEST_RETENTION_HOURS; chats and messages go with them (FK cascade)."""
    hours = int(payload.get("hours") or os.environ.get("GUEST_RETENTION_HOURS", "24"))
    cur = conn.execute(
        """DELETE FROM app.users u WHERE u.is_anonymous
             AND u.created_at < now() - make_interval(hours => %(h)s)
             AND NOT EXISTS (SELECT 1 FROM app.sessions s WHERE s.user_id = u.id AND s.updated_at > now() - make_interval(hours => %(h)s))
             AND NOT EXISTS (SELECT 1 FROM app.chats c WHERE c.user_id = u.id AND c.updated_at > now() - make_interval(hours => %(h)s))""",
        {"h": hours})
    if cur.rowcount:
        _audit(conn, "privacy.guest_purged", "user", None, {"count": cur.rowcount, "hours": hours})
    return {"guests_deleted": cur.rowcount}


def purge_deleted_accounts(conn: Connection, payload: dict[str, Any]) -> dict[str, Any]:
    """Permanently delete members whose 30-day grace period (BR-012) has ended. Staff accounts are left for a human:
    they own kb.* rows (authors, reviewers) that must be re-assigned first, so they are counted, not deleted."""
    due = conn.execute("""SELECT id, role::text AS role FROM app.users
                          WHERE status = 'pending_deletion' AND deletion_scheduled_at <= now() AND deleted_at IS NULL""").fetchall()
    deleted = skipped = 0
    for row in due:
        if row["role"] != "member":
            skipped += 1
            continue
        try:
            with conn.transaction():  # savepoint: one bad row must not block the others
                conn.execute("""UPDATE app.dsr_requests SET status = 'completed', completed_at = now(), updated_at = now(),
                                       notes = 'account deleted after grace period'
                                WHERE user_id = %s AND request_type = 'erase' AND status = 'in_progress'""", (row["id"],))
                conn.execute("DELETE FROM app.users WHERE id = %s", (row["id"],))
                _audit(conn, "privacy.account_purged", "user", str(row["id"]), {})
            deleted += 1
        except Exception:
            skipped += 1
            log.exception("purge_account_failed", extra={"user_id": row["id"]})
    return {"accounts_deleted": deleted, "skipped": skipped}


def extract_contract(conn: Connection, payload: dict[str, Any]) -> dict[str, Any]:
    """Read an uploaded (encrypted) contract from storage, extract its text, segment it into clauses and keep the result
    encrypted in app.contracts.text_enc — never in kb.chunks (FR-CR-002). Scans are reported as unsupported, not guessed at."""
    cid = payload.get("contract_id")
    row = conn.execute("""SELECT id, org_id, mime_type, storage_path, dek_wrapped, deleted_at FROM app.contracts WHERE id = %s""",
                       (cid,)).fetchone()
    if not row or row["deleted_at"]:
        return {"skipped": "gone"}
    kr = keyring_from_env()
    dek = unwrap_dek(kr, bytes(row["dek_wrapped"]), f"app.contracts.dek_wrapped:{cid}")
    data = decrypt_raw(dek, storage.get_bytes(row["storage_path"]), row["storage_path"])
    try:
        ex = extract_text(data, row["mime_type"])
    except UnsupportedFile as exc:
        conn.execute("UPDATE app.contracts SET status = 'failed', updated_at = now() WHERE id = %s", (cid,))
        return {"status": "failed", "reason": str(exc)}
    if ex.is_scan:
        conn.execute("UPDATE app.contracts SET status = 'unsupported_scan', page_count = %s, updated_at = now() WHERE id = %s",
                     (ex.page_count, cid))
        return {"status": "unsupported_scan", "pages": ex.page_count or 0}
    text_enc = encrypt_field(kr, json.dumps(ex.as_json(), ensure_ascii=False), f"app.contracts.text_enc:{cid}")
    hint = encrypt_field(kr, " / ".join(ex.parties), f"app.contracts.counterparty_hint_enc:{cid}") if ex.parties else None
    conn.execute("""UPDATE app.contracts SET status = 'ready', text_enc = %s, counterparty_hint_enc = %s, page_count = %s,
                           key_version = %s, updated_at = now() WHERE id = %s""",
                 (text_enc, hint, ex.page_count, kr.current, cid))
    return {"status": "ready", "clauses": len(ex.clauses), "pages": ex.page_count or 0}


def _fail_review(conn: Connection, review_id: int, contract_id: str, code: str, backend: str | None) -> dict[str, Any]:
    """A review that could not be produced: the contract goes back to `ready` (it can be tried again), the row keeps only the code."""
    conn.execute("""UPDATE app.contract_reviews SET status = 'failed', error_code = %s, backend = %s, finished_at = now()
                    WHERE id = %s""", (code, backend, review_id))
    conn.execute("UPDATE app.contracts SET status = 'ready', updated_at = now() WHERE id = %s AND status = 'reviewing'", (contract_id,))
    log.warning("contract_review_failed", extra={"review_id": review_id, "contract_id": contract_id, "error_code": code})
    return {"status": "failed", "error_code": code}


def review_contract(conn: Connection, payload: dict[str, Any]) -> dict[str, Any]:
    """Review the clauses of a contract with the configured backend (app/contracts/review.py) and keep the result encrypted in
    app.contract_reviews. The clauses are PII-masked before they reach any backend; the findings hold clause numbers and short
    notes only. A backend failure is a result (status failed + code), not an exception, so the job is not retried blindly."""
    cid, rid = payload.get("contract_id"), payload.get("review_id")
    if not isinstance(rid, int):
        raise ValueError("bad review_contract payload")
    row = conn.execute("""SELECT r.status AS review_status, c.deleted_at, c.text_enc FROM app.contract_reviews r
                          JOIN app.contracts c ON c.id = r.contract_id WHERE r.id = %s AND r.contract_id = %s""", (rid, cid)).fetchone()
    if not row or row["deleted_at"]:
        return {"skipped": "gone"}
    if row["review_status"] in ("completed", "failed", "stopped"):
        return {"skipped": row["review_status"]}
    settings = get_settings()
    backend = contract_review.get_backend(settings)
    if backend is None:
        return _fail_review(conn, rid, cid, "REVIEW_DISABLED", None)
    conn.execute("UPDATE app.contract_reviews SET status = 'running', started_at = coalesce(started_at, now()), backend = %s WHERE id = %s",
                 (backend.name, rid))
    started = time.monotonic()
    kr = keyring_from_env()
    try:
        with conn.transaction():   # savepoint: whatever goes wrong below, the failure itself must still be recorded
            doc = json.loads(decrypt_field(kr, bytes(row["text_enc"]), f"app.contracts.text_enc:{cid}"))
            stored = doc["clauses"]
            clauses = [contract_review.ClauseIn(c["ref"], mask_pii(c.get("title") or "").text, mask_pii(c["text"]).text) for c in stored]
            result = backend.review(clauses, request_id=str(rid))
            # findings are matched to clauses by clause_no, in order, so repeated numbers still map to distinct clauses
            slots: dict[str, list[int]] = {}
            for i, c in enumerate(clauses):
                slots.setdefault(c.clause_no, []).append(i)
            findings = []
            for f in result.findings:
                idx = slots[f.clause_no].pop(0) if len(slots[f.clause_no]) > 1 else slots[f.clause_no][0]
                findings.append({"idx": idx, "clause_no": f.clause_no, "risk": f.risk, "note": f.note, "suggestion": f.suggestion,
                                 "state": f.state})
            counts = {r: sum(1 for f in findings if f["risk"] == r) for r in contract_review.RISKS}
            summary = result.summary
            if backend.name == "pnc":   # the company API gives no key terms: keep only the parties our own reader found (an unverified hint)
                summary = contract_review.Summary(parties=[str(p)[:120] for p in (doc.get("parties") or [])][:4])
            summary_json = {**summary.as_json(), "not_checked": result.not_checked}
            conn.execute("""UPDATE app.contract_reviews SET status = 'completed', summary_enc = %s, findings_enc = %s, finding_counts = %s,
                                   backend = %s, error_code = NULL, latency_total_ms = %s, finished_at = now() WHERE id = %s""",
                         (encrypt_field(kr, json.dumps(summary_json, ensure_ascii=False), f"app.contract_reviews.summary_enc:{rid}"),
                          encrypt_field(kr, json.dumps(findings, ensure_ascii=False), f"app.contract_reviews.findings_enc:{rid}"),
                          Jsonb(counts), backend.name, int((time.monotonic() - started) * 1000), rid))
            conn.execute("DELETE FROM app.contract_reviews WHERE contract_id = %s AND id <> %s", (cid, rid))   # only the latest result is kept
            conn.execute("UPDATE app.contracts SET status = 'reviewed', updated_at = now() WHERE id = %s", (cid,))
    except contract_review.ReviewError as exc:
        return _fail_review(conn, rid, cid, exc.code, backend.name)
    except Exception as exc:   # never put the exception text anywhere: it may quote the contract
        log.error("contract_review_error", extra={"review_id": rid, "error": type(exc).__name__})
        return _fail_review(conn, rid, cid, "REVIEW_INTERNAL", backend.name)
    log.info("contract_review_done", extra={"review_id": rid, "contract_id": cid, "backend": backend.name, "clauses": len(clauses)})
    return {"status": "completed", "backend": backend.name, "clauses": len(clauses), "not_checked": result.not_checked, **counts}


def purge_contracts(conn: Connection, payload: dict[str, Any]) -> dict[str, Any]:
    """Delete the stored object, the extracted text and the reviews of contracts that were deleted by a user (FR-CR-009) or
    whose retention ended (BR-024). The row goes with them (reviews cascade); the audit entry keeps only counts and ids."""
    rows = conn.execute("""SELECT id, org_id, storage_path, deleted_at IS NOT NULL AS by_user FROM app.contracts
                           WHERE deleted_at IS NOT NULL OR (retention_until IS NOT NULL AND retention_until < now())""").fetchall()
    removed = failed = 0
    for r in rows:
        try:
            storage.remove(r["storage_path"])
            with conn.transaction():
                conn.execute("DELETE FROM app.contracts WHERE id = %s", (r["id"],))
                _audit(conn, "org.contract_purged", "contract", str(r["id"]),
                       {"org_id": str(r["org_id"]), "reason": "deleted" if r["by_user"] else "retention"})
            removed += 1
        except Exception:
            failed += 1
            log.exception("purge_contract_failed", extra={"contract_id": str(r["id"])})
    return {"contracts_deleted": removed, "failed": failed}


def purge_deleted_orgs(conn: Connection, payload: dict[str, Any]) -> dict[str, Any]:
    """Erase organizations whose 30-day grace period ended (FR-ORG-011): members, chats and messages, contracts and reviews
    go by FK cascade. The counts are returned and audited so the deletion can be shown to be complete (AC2)."""
    due = conn.execute("""SELECT id FROM app.organizations WHERE status = 'pending_deletion' AND deletion_scheduled_at <= now()""").fetchall()
    orgs = 0
    totals = {"members": 0, "chats": 0, "contracts": 0}
    for row in due:
        org = row["id"]
        try:
            with conn.transaction():
                counts = conn.execute(
                    """SELECT (SELECT count(*) FROM app.members WHERE organization_id = %(o)s) AS members,
                              (SELECT count(*) FROM app.chats WHERE org_id = %(o)s) AS chats,
                              (SELECT count(*) FROM app.contracts WHERE org_id = %(o)s) AS contracts""", {"o": org}).fetchone()
                for c in conn.execute("SELECT storage_path FROM app.contracts WHERE org_id = %s", (org,)).fetchall():
                    storage.remove(c["storage_path"])  # objects first: once the rows are gone nothing points at them any more
                # audit rows of the organization stay (pseudonymous ids only) — they are the proof the deletion happened
                conn.execute("DELETE FROM app.organizations WHERE id = %s", (org,))
                _audit(conn, "org.purged", "org", str(org), {"org_id": str(org), **{k: int(v) for k, v in counts.items()}})
            orgs += 1
            for k in totals:
                totals[k] += int(counts[k])
        except Exception:
            log.exception("purge_org_failed", extra={"org_id": str(org)})
    return {"orgs_deleted": orgs, **{f"{k}_deleted": v for k, v in totals.items()}}


def purge_soft_deleted(conn: Connection, payload: dict[str, Any]) -> dict[str, Any]:
    """Chats, folders and saved items the user deleted are erased for good 30 days later (FR-CHAT-022 AC3)."""
    days = int(payload.get("days") or 30)
    chats = conn.execute("DELETE FROM app.chats WHERE deleted_at < now() - make_interval(days => %s)", (days,)).rowcount
    folders = conn.execute("DELETE FROM app.chat_folders WHERE deleted_at < now() - make_interval(days => %s)", (days,)).rowcount
    saved = conn.execute("DELETE FROM app.bookmarks WHERE deleted_at < now() - make_interval(days => %s)", (days,)).rowcount
    return {"chats_deleted": chats, "folders_deleted": folders, "bookmarks_deleted": saved}


def purge_expired_shares(conn: Connection, payload: dict[str, Any]) -> dict[str, Any]:
    """Share links revoked or expired more than 30 days ago (rows are kept that long for support and audit)."""
    n = conn.execute("""DELETE FROM app.chat_shares WHERE coalesce(revoked_at, expires_at) < now() - interval '30 days'""").rowcount
    return {"shares_deleted": n}


def dsr_digest(conn: Connection, payload: dict[str, Any]) -> dict[str, Any]:
    """Daily e-mail to the admins listing data-subject requests due within 7 days (FR-ADM-023 AC1, NFR-PRIV-006).
    The mail carries counts and request ids only — never who asked or what for."""
    due = conn.execute("""SELECT id, request_type, status, due_at::date AS due, due_at < now() AS overdue FROM app.dsr_requests
                          WHERE status IN ('received', 'in_progress') AND due_at <= now() + interval '7 days' ORDER BY due_at""").fetchall()
    if not due:
        return {"due": 0, "mailed": 0}
    admins = [r["email"] for r in conn.execute(
        "SELECT email::text AS email FROM app.users WHERE role = 'admin' AND status = 'active' AND NOT banned AND NOT is_anonymous").fetchall()]
    if not admins:
        return {"due": len(due), "mailed": 0}
    lines = [f"#{r['id']}  {r['request_type']}  due {r['due']}{'  OVERDUE' if r['overdue'] else ''}" for r in due]
    body = (f"{len(due)} data-subject request(s) are due within 7 days (30-day PDPA limit):\n\n" + "\n".join(lines)
            + "\n\nOpen the back-office → Data requests to handle them.\n"
            f"\n{len(due)} คำขอใช้สิทธิเจ้าของข้อมูลใกล้ครบกำหนด (ภายใน 7 วัน) — เปิดหลังบ้าน > คำขอใช้สิทธิ เพื่อดำเนินการ\n")
    mail.send(admins, f"[Nitimitr] {len(due)} data request(s) due soon", body)
    return {"due": len(due), "mailed": len(admins)}


def purge_ops_tables(conn: Connection, payload: dict[str, Any]) -> dict[str, Any]:
    """Housekeeping of short-lived auth rows: expired sessions and verification/reset tokens."""
    sessions = conn.execute("DELETE FROM app.sessions WHERE expires_at < now() - interval '1 day'").rowcount
    tokens = conn.execute("DELETE FROM app.verifications WHERE expires_at < now() - interval '1 day'").rowcount
    return {"sessions_deleted": sessions, "tokens_deleted": tokens}


HANDLERS: dict[str, Callable[[Connection, dict[str, Any]], dict[str, Any]]] = {
    "reindex": reindex,
    "ingest_content": ingest_content,
    "ingest_law": ingest_law,
    "purge_guest_data": purge_guest_data,
    "purge_deleted_accounts": purge_deleted_accounts,
    "purge_deleted_orgs": purge_deleted_orgs,
    "extract_contract": extract_contract,
    "review_contract": review_contract,
    "purge_contracts": purge_contracts,
    "dsr_digest": dsr_digest,
    "purge_soft_deleted": purge_soft_deleted,
    "purge_expired_shares": purge_expired_shares,
    "purge_ops_tables": purge_ops_tables,
}

# Recurring jobs: type → interval in seconds. The worker enqueues each once per interval (see worker/__main__.py).
SCHEDULE: dict[str, int] = {
    "purge_contracts": 3600, "purge_guest_data": 3600, "purge_deleted_accounts": 3600, "purge_deleted_orgs": 3600,
    "purge_soft_deleted": 86400, "purge_expired_shares": 86400, "purge_ops_tables": 86400, "dsr_digest": 86400,
}
