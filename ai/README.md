# ai — AI service (FastAPI)

Retrieval, extractive answers, guardrails and SSE streaming for Nitimitr. There is no LLM in this product: answers are
assembled verbatim from the knowledge base, and the only outside source is the optional company chatbot API
(`PNC_*`, `app/external/company_kb.py`). Design: `docs/03-technical-spec.md` §1.2–1.4, §3.4–3.5.

## Run (dev)
```bash
cd /opt/setup/legal-consult
docker compose --env-file .env -f deploy/docker-compose.dev.yml up -d --build ai   # http://127.0.0.1:8200
docker compose --env-file .env -f deploy/docker-compose.dev.yml exec ai pytest -q
docker compose --env-file .env -f deploy/docker-compose.dev.yml logs -f ai
```

## Environment
`AI_SERVICE_TOKEN` (+ `AI_SERVICE_TOKEN_PREVIOUS` during rotation), `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD`
(runtime role `lc_ai`), `EMBED_URL`, `KB_SERVE_DRAFTS`, `PNC_*`, `LOG_LEVEL`.

## Endpoints
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/healthz` | – | process alive |
| GET | `/readyz` | – | DB check, 503 if down |
| POST | `/v1/chat/stream` | `X-Service-Token` + `X-LC-User` | SSE; events per spec §3.4.2 |

`X-LC-User` (JSON, set by web): `{"user_id": "42" | null, "guest_id": uuid | null, "role": "member",
"is_anonymous": false, "locale": "th"|"en", "explain_level": null, "org_id": uuid | null}` — exactly one of
`user_id` / `guest_id`.

Errors before the stream starts are JSON `{"error": {"code", "message"}}`: 401 `unauthorized`,
400 `missing_user`/`invalid_user`, 404 `chat_not_found`, 422 `validation_error`/`regenerate_requires_chat`.

## Answers
The extractive engine is the only engine. If it is not started (e.g. the embedding service is down at boot) the
stream returns `guardrail {kind: "unavailable"}` then `complete`. Logs never contain message text — only ids,
lengths and timings.
