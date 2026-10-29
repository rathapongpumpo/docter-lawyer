-- 2.3.6 Chats & messages — `0006_app_chat.sql`
-- Source: docs/03-technical-spec.md §2.3 (keep in sync; forward-only)

CREATE TABLE app.chat_folders (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       bigint NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  is_collapsed  boolean NOT NULL DEFAULT false,
  sort_order    int NOT NULL DEFAULT 0,
  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_chat_folders_user ON app.chat_folders(user_id, sort_order) WHERE deleted_at IS NULL;

CREATE TABLE app.chats (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          bigint REFERENCES app.users(id) ON DELETE CASCADE,
  guest_id         uuid,                              -- = app.users.guest_uuid ของ anonymous user (guest)
  folder_id        bigint REFERENCES app.chat_folders(id) ON DELETE SET NULL,
  title            text NOT NULL DEFAULT '',
  title_source     text NOT NULL DEFAULT 'auto' CHECK (title_source IN ('auto','user')),
  is_pinned        boolean NOT NULL DEFAULT false,
  sort_order       int NOT NULL DEFAULT 0,
  scope            text[] NOT NULL DEFAULT '{}',     -- category codes; ว่าง = auto
  explain_level    app.explain_level,
  context_type     text CHECK (context_type IN ('lesson','article','law_section','guide','template','case','court_tool')),
  context_id       text,                              -- id/slug ของ context (case = uuid)
  case_id          uuid,                              -- FK → app.cases(id) ON DELETE SET NULL (เพิ่มใน migration Phase 2); ต้องมี consent sensitive_case_data
  memory_summary   text,                              -- สรุปบทสนทนาเก่าสำหรับ context window (§4.6) — PII-masked
  summary_upto_message_id bigint,                     -- สรุปครอบคลุมถึง message id นี้ (ข้อความหลังจากนี้ส่งแบบเต็ม)
  message_count    int NOT NULL DEFAULT 0,
  last_message_at  timestamptz,
  deleted_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK ((user_id IS NOT NULL) <> (guest_id IS NOT NULL))  -- เป็นของ user หรือ guest อย่างใดอย่างหนึ่ง
);
CREATE INDEX ix_chats_user_list  ON app.chats(user_id, is_pinned DESC, sort_order, last_message_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX ix_chats_guest      ON app.chats(guest_id, created_at) WHERE guest_id IS NOT NULL;
CREATE INDEX ix_chats_title_trgm ON app.chats USING gin (title gin_trgm_ops) WHERE deleted_at IS NULL;

CREATE TABLE app.messages (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chat_id            uuid NOT NULL REFERENCES app.chats(id) ON DELETE CASCADE,
  role               app.message_role NOT NULL,
  status             app.message_status NOT NULL DEFAULT 'completed',
  content            text NOT NULL,                  -- user: ข้อความที่พิมพ์; assistant: markdown พร้อม marker [n]
  parent_message_id  bigint REFERENCES app.messages(id),   -- assistant → user message ที่ตอบ
  is_active          boolean NOT NULL DEFAULT true,  -- false เมื่อถูก regenerate แทน
  superseded_by      bigint REFERENCES app.messages(id),
  explain_level      app.explain_level,
  scope              text[] NOT NULL DEFAULT '{}',
  suggestions        jsonb,                          -- {followups, quick_replies, next_steps}
  safety_notice      jsonb,                          -- payload ของ event safety_notice
  guardrail          jsonb,                          -- {kind, stage, reason, generic}
  model              text,
  prompt_version_id  bigint,                         -- FK → kb.prompt_versions(id) เพิ่มใน 0009
  verification       jsonb,                          -- ผล output verifier: {"unknown_refs":[…],"removed_citations":[n…],"numbers_flagged":[…],"regenerated":bool,"disclaimer":bool}
  verification_status text CHECK (verification_status IN ('passed','repaired','warned','failed')),  -- NULL สำหรับ role=user
  input_tokens       int,
  output_tokens      int,
  ttft_ms            int,
  latency_ms         int,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_messages_chat ON app.messages(chat_id, id) WHERE is_active;
CREATE INDEX ix_messages_feedback_join ON app.messages(id) WHERE role = 'assistant';
CREATE INDEX ix_messages_verify_issue ON app.messages(created_at DESC) WHERE verification_status IN ('warned','failed');

CREATE TABLE app.message_citations (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  message_id      bigint NOT NULL REFERENCES app.messages(id) ON DELETE CASCADE,
  n               smallint NOT NULL,                 -- หมายเลขที่แสดง [n]
  kind            app.citation_kind NOT NULL,
  ref_id          bigint NOT NULL,                   -- id ใน kb.* ตาม kind (law_section → kb.law_sections.id)
  ref_version     bigint,                            -- law_version_id / article_version_id ขณะตอบ
  chunk_id        bigint,                            -- kb.chunks.id (อาจถูกลบเมื่อ reindex → ไม่ใส่ FK)
  label           text NOT NULL,                     -- 'ป.พ.พ. ม.420'
  title           text NOT NULL,
  snippet         text,                              -- ตัดจาก cited_text ≤ 400 ตัวอักษร
  cited_text      text,
  url             text NOT NULL,                     -- '/law/ccc/420?v=123'
  as_of           date NOT NULL,                     -- วันที่ข้อมูล (วันที่ตอบ)
  effective_from  date,
  UNIQUE (message_id, n)
);
CREATE INDEX ix_citations_ref ON app.message_citations(kind, ref_id);

CREATE TABLE app.message_feedback (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  message_id        bigint NOT NULL REFERENCES app.messages(id) ON DELETE CASCADE,
  user_id           bigint REFERENCES app.users(id) ON DELETE SET NULL,
  guest_id          uuid,
  rating            smallint NOT NULL CHECK (rating IN (-1, 1)),
  reasons           app.feedback_reason[] NOT NULL DEFAULT '{}',
  comment           text CHECK (char_length(comment) <= 2000),
  allow_review      boolean NOT NULL DEFAULT false,  -- ผู้ใช้ยินยอมให้ reviewer เห็นบทสนทนานี้
  review_state      app.review_state NOT NULL DEFAULT 'open',
  reviewer_id       bigint REFERENCES app.users(id),
  reviewer_note     text,
  corrected_answer  text,
  added_to_eval_id  bigint,                          -- kb.eval_cases.id
  reviewed_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_feedback_one_per_user ON app.message_feedback(message_id, COALESCE(user_id, 0), COALESCE(guest_id, '00000000-0000-0000-0000-000000000000'));
CREATE INDEX ix_feedback_queue ON app.message_feedback(review_state, created_at) WHERE rating = -1;

CREATE TABLE app.chat_shares (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chat_id              uuid NOT NULL REFERENCES app.chats(id) ON DELETE CASCADE,
  created_by           bigint NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  token_hash           bytea NOT NULL UNIQUE,        -- sha256(token)
  password_hash        text,                         -- argon2id (ไม่บังคับ)
  snapshot_message_id  bigint NOT NULL REFERENCES app.messages(id),
  expires_at           timestamptz,
  revoked_at           timestamptz,
  view_count           int NOT NULL DEFAULT 0,
  last_viewed_at       timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_chat_shares_chat ON app.chat_shares(chat_id) WHERE revoked_at IS NULL;
