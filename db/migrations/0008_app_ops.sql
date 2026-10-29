-- 2.3.8 Operations tables — `0008_app_ops.sql`
-- Source: docs/03-technical-spec.md §2.3 (keep in sync; forward-only)

CREATE TABLE app.usage_counters (
  subject_key     text NOT NULL,                     -- 'u:<user_id>' | 'g:<guest_id>'
  day             date NOT NULL,                     -- วันตามเวลา Asia/Bangkok
  messages        int NOT NULL DEFAULT 0,
  input_tokens    bigint NOT NULL DEFAULT 0,
  output_tokens   bigint NOT NULL DEFAULT 0,
  cost_usd        numeric(12,6) NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (subject_key, day)
);
-- quota แบบ real-time ตรวจใน Redis; ตารางนี้เป็น source ถาวร (upsert หลัง complete)

CREATE TABLE app.audit_log (
  id             bigint GENERATED ALWAYS AS IDENTITY,
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  actor_user_id  bigint,
  actor_role     text,
  action         text NOT NULL,                      -- 'auth.login_success','content.publish','user.role_change','privacy.export', …
  target_type    text,
  target_id      text,
  request_id     text,
  ip_hash        bytea,
  user_agent     text,
  meta           jsonb NOT NULL DEFAULT '{}',        -- ห้ามมีเนื้อหาแชท/ข้อมูลคดี
  PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);
-- partition รายเดือน สร้างล่วงหน้า 3 เดือนด้วย job; เก็บ 2 ปี
CREATE TABLE app.audit_log_2026_09 PARTITION OF app.audit_log FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE INDEX ix_audit_actor  ON app.audit_log(actor_user_id, occurred_at DESC);
CREATE INDEX ix_audit_action ON app.audit_log(action, occurred_at DESC);

CREATE TABLE app.jobs (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type          text NOT NULL CHECK (type IN (
                  'ingest_law','ingest_content','reindex','ai_precheck','export_chat_pdf','render_template',
                  'send_email','send_reminder','purge_guest_data','purge_soft_deleted','purge_expired_shares','purge_deleted_accounts','purge_ops_tables','export_case',
                  'content_review_due','usage_rollup','eval_run','gen_chat_title','rotate_keys','privacy_export')),
  payload       jsonb NOT NULL DEFAULT '{}',
  status        app.job_status NOT NULL DEFAULT 'queued',
  priority      smallint NOT NULL DEFAULT 5,          -- 1 = สูงสุด
  run_after     timestamptz NOT NULL DEFAULT now(),
  attempts      int NOT NULL DEFAULT 0,
  max_attempts  int NOT NULL DEFAULT 5,
  dedupe_key    text,
  locked_by     text,
  locked_at     timestamptz,
  last_error    text,
  result        jsonb,
  created_by    bigint REFERENCES app.users(id),
  finished_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_jobs_claim ON app.jobs(priority, run_after) WHERE status = 'queued';
CREATE UNIQUE INDEX ux_jobs_dedupe ON app.jobs(dedupe_key) WHERE dedupe_key IS NOT NULL AND status IN ('queued','running');
-- claim:
-- UPDATE app.jobs SET status='running', locked_by=$1, locked_at=now(), attempts=attempts+1
--  WHERE id = (SELECT id FROM app.jobs WHERE status='queued' AND run_after<=now()
--              ORDER BY priority, run_after FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *;
-- ปลุก worker: NOTIFY lc_jobs (trigger AFTER INSERT)

CREATE TABLE app.guardrail_events (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  chat_id      uuid,
  message_id   bigint REFERENCES app.messages(id) ON DELETE SET NULL,
  user_id      bigint,
  guest_id     uuid,
  stage        app.guardrail_stage NOT NULL,
  verdict      app.guardrail_verdict NOT NULL,
  category     text,                                 -- 'prompt_injection','off_topic','illegal_request','unverified_section','safety.domestic_violence',…
  reason       text,                                 -- ข้อความสั้นสำหรับ admin (ไม่มีข้อความผู้ใช้)
  latency_ms   int,
  detail       jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX ix_guardrail_time ON app.guardrail_events(occurred_at DESC);
CREATE INDEX ix_guardrail_cat  ON app.guardrail_events(category, verdict, occurred_at DESC);

CREATE TABLE app.llm_calls (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at         timestamptz NOT NULL DEFAULT now(),
  message_id          bigint REFERENCES app.messages(id) ON DELETE SET NULL,
  purpose             text NOT NULL CHECK (purpose IN ('answer_system','triage','rewrite','suggestions','title','precheck','template_explain','summarize_history','contract_segment','contract_review','eval_judge')),  -- = kb.prompt_versions.name (+ eval_judge สำหรับ LLM-as-judge)
  model               text NOT NULL,                 -- model ที่ขอ
  served_model        text,                          -- model ที่ตอบจริง (กรณี fallback)
  prompt_version_id   bigint,
  effort              text,
  input_tokens        int NOT NULL DEFAULT 0,
  output_tokens       int NOT NULL DEFAULT 0,
  cache_read_tokens   int NOT NULL DEFAULT 0,
  cache_write_tokens  int NOT NULL DEFAULT 0,
  stop_reason         text,                          -- end_turn | max_tokens | refusal | …
  refusal_category    text,
  ttft_ms             int,
  latency_ms          int,
  cost_usd            numeric(12,6),
  anthropic_request_id text,
  error_type          text
);
CREATE INDEX ix_llm_calls_time ON app.llm_calls(occurred_at DESC);
CREATE INDEX ix_llm_calls_purpose ON app.llm_calls(purpose, occurred_at DESC);

-- ผลการค้นคืนต่อคำตอบ (debug คุณภาพ RAG / eval) — ห้ามเก็บข้อความผู้ใช้ดิบ
CREATE TABLE app.retrieval_logs (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  message_id          bigint REFERENCES app.messages(id) ON DELETE CASCADE,   -- assistant message
  query_rewritten     text NOT NULL,                 -- query หลัง rewrite และผ่าน PII masking แล้วเท่านั้น
  filters             jsonb NOT NULL DEFAULT '{}',   -- {"scope":["LABOR"],"as_of":"2026-09-24","source_types":[…]}
  candidates          jsonb NOT NULL DEFAULT '[]',   -- [{"chunk_id":…, "dense_score":…, "lexical_score":…, "rrf":…, "rerank":…}]
  selected_chunk_ids  bigint[] NOT NULL DEFAULT '{}',-- chunk ที่ถูกส่งเป็น document block ให้ LLM (ไม่มี FK — reindex ได้)
  latency_ms          int,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_retrieval_logs_msg  ON app.retrieval_logs(message_id);
CREATE INDEX ix_retrieval_logs_time ON app.retrieval_logs(created_at);
-- retention 90 วัน (job purge_ops_tables)

-- คำขอใช้สิทธิเจ้าของข้อมูล (PDPA) — SLA 30 วัน
CREATE TABLE app.dsr_requests (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        bigint REFERENCES app.users(id) ON DELETE SET NULL,  -- NULL หลังลบบัญชี (คงหลักฐาน)
  request_type   text NOT NULL CHECK (request_type IN ('access','export','rectify','erase','object','withdraw_consent')),
  status         text NOT NULL DEFAULT 'received' CHECK (status IN ('received','in_progress','completed','rejected')),
  channel        text NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app','email','other')),
  due_at         timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  handled_by     bigint REFERENCES app.users(id),
  notes          text,                               -- บันทึกการดำเนินการ (ห้ามมีข้อมูลคดี)
  result_job_id  bigint REFERENCES app.jobs(id),     -- เช่น job privacy_export
  completed_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_dsr_open ON app.dsr_requests(due_at) WHERE status IN ('received','in_progress');
CREATE INDEX ix_dsr_user ON app.dsr_requests(user_id, created_at DESC);
