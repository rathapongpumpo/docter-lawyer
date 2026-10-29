-- 2.3.10 Organizations & contracts (M11/M12) — `0010_orgs_contracts.sql`
-- Source: docs/03-technical-spec.md §2.3 (keep in sync; forward-only)

CREATE TYPE app.org_role        AS ENUM ('org_owner','org_admin','org_member','org_counsel');
CREATE TYPE app.visibility      AS ENUM ('private','org');
CREATE TYPE app.contract_status AS ENUM ('uploaded','extracting','unsupported_scan','ready','reviewing','reviewed','failed');
CREATE TYPE kb.review_severity  AS ENUM ('high','medium','low');

CREATE TABLE app.organizations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  slug                  citext NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{3,48}$'),
  logo                  text,                                   -- Better Auth field (object key ใน MinIO)
  metadata              jsonb,                                  -- Better Auth field
  business_type         text,
  province_code         text,
  status                text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','pending_deletion','deleted')),
  deletion_scheduled_at timestamptz,                            -- ลบองค์กร: ข้อมูลทั้งหมดลบภายใน 30 วัน (BR-024)
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.members (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  user_id          bigint NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  role             app.org_role NOT NULL DEFAULT 'org_member',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX ix_members_user ON app.members(user_id);
-- "ต้องมี org_owner ≥ 1" ตรวจใน service layer + trigger กันลบ/ลด role owner คนสุดท้าย

CREATE TABLE app.invitations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  email            citext NOT NULL,
  role             app.org_role NOT NULL DEFAULT 'org_member' CHECK (role <> 'org_owner'),
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','canceled','expired')),
  inviter_id       bigint REFERENCES app.users(id) ON DELETE SET NULL,
  expires_at       timestamptz NOT NULL,                          -- now() + 7 วัน
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_invitations_pending ON app.invitations(organization_id, email) WHERE status = 'pending';

CREATE TABLE app.org_settings (
  organization_id          uuid PRIMARY KEY REFERENCES app.organizations(id) ON DELETE CASCADE,
  plan                     text NOT NULL DEFAULT 'pilot',
  seat_limit               int  NOT NULL DEFAULT 20,
  chat_daily_per_member    int  NOT NULL DEFAULT 300,
  contract_reviews_monthly int  NOT NULL DEFAULT 50,
  contract_retention_days  int  DEFAULT 180 CHECK (contract_retention_days IN (30,90,180,365)),   -- NULL = เก็บจนกว่าจะลบ
  sso_config               jsonb,                                  -- P2
  updated_by               bigint REFERENCES app.users(id) ON DELETE SET NULL,
  updated_at               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.sessions ADD COLUMN active_organization_id uuid REFERENCES app.organizations(id) ON DELETE SET NULL;

-- ขอบเขตองค์กรบนตารางเดิม (NULL = พื้นที่ส่วนตัว)
ALTER TABLE app.chats        ADD COLUMN org_id uuid REFERENCES app.organizations(id) ON DELETE CASCADE,
                             ADD COLUMN visibility app.visibility NOT NULL DEFAULT 'private';
ALTER TABLE app.chat_folders ADD COLUMN org_id uuid REFERENCES app.organizations(id) ON DELETE CASCADE,
                             ADD COLUMN visibility app.visibility NOT NULL DEFAULT 'private';
ALTER TABLE app.bookmarks    ADD COLUMN org_id uuid REFERENCES app.organizations(id) ON DELETE CASCADE;
ALTER TABLE app.usage_counters ADD COLUMN org_id uuid;           -- subject_key รองรับ 'o:<org_id>' (quota รายองค์กร)
ALTER TABLE app.chats ADD CONSTRAINT ck_chats_org_owner CHECK (org_id IS NULL OR user_id IS NOT NULL);   -- guest ไม่มีองค์กร
ALTER TABLE app.chats DROP CONSTRAINT IF EXISTS chats_context_type_check;
ALTER TABLE app.chats ADD CONSTRAINT chats_context_type_check CHECK (context_type IN ('lesson','article','law_section','guide','template','case','court_tool','contract'));
CREATE INDEX ix_chats_org_list ON app.chats(org_id, visibility, last_message_at DESC) WHERE org_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX ix_chat_folders_org ON app.chat_folders(org_id) WHERE org_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX ix_usage_org_day ON app.usage_counters(org_id, day) WHERE org_id IS NOT NULL;

CREATE TABLE kb.review_rules (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rule_code       text NOT NULL,                                  -- เช่น 'PEN-NO-CAP', 'TERM-NO-CURE-PERIOD'
  version_no      int  NOT NULL DEFAULT 1,
  clause_type     text NOT NULL CHECK (clause_type IN ('parties','subject','price_payment','delivery_acceptance','penalty','deposit','warranty_defects','termination','liability_limit','dispute_jurisdiction','governing_law','other')),
  title           text NOT NULL,
  condition_md    text NOT NULL,                                  -- เงื่อนไขที่ตรวจ (ภาษาคน + ตัวอย่างถ้อยคำ) — ส่งให้ model
  detect_hints    jsonb NOT NULL DEFAULT '{}',                    -- {"keywords":["ค่าปรับ","วันละ"],"absent_ok":false} ใช้ pre-filter
  severity        kb.review_severity NOT NULL,
  explanation_md  text NOT NULL,
  suggestion_md   text NOT NULL,                                  -- ประเด็นที่ควรเจรจา
  legal_basis     jsonb NOT NULL CHECK (jsonb_typeof(legal_basis) = 'array' AND jsonb_array_length(legal_basis) >= 1),  -- [{"law":"ccc","section":"383"}]
  status          kb.content_status NOT NULL DEFAULT 'draft',
  as_of           date,
  review_due_at   date,
  created_by      bigint REFERENCES app.users(id) ON DELETE SET NULL,
  reviewed_by     bigint REFERENCES app.users(id) ON DELETE SET NULL,
  published_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rule_code, version_no)
);
CREATE UNIQUE INDEX ux_review_rules_published ON kb.review_rules(rule_code) WHERE status = 'published';
CREATE INDEX ix_review_rules_clause ON kb.review_rules(clause_type) WHERE status = 'published';

CREATE TABLE app.contracts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  uploaded_by         bigint NOT NULL REFERENCES app.users(id),
  visibility          app.visibility NOT NULL DEFAULT 'private',
  file_name_enc       bytea NOT NULL,
  key_version         smallint NOT NULL,
  mime_type           text NOT NULL CHECK (mime_type IN ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes          int  NOT NULL CHECK (size_bytes <= 20971520),      -- CONTRACT_MAX_MB
  page_count          int  CHECK (page_count <= 50),                     -- CONTRACT_MAX_PAGES
  storage_path        text NOT NULL,                                     -- lc-private/org/<org_id>/contracts/<id>
  dek_wrapped         bytea NOT NULL,                                    -- DEK ต่อไฟล์ (§2.5)
  sha256              text NOT NULL,
  av_status           text NOT NULL DEFAULT 'pending' CHECK (av_status IN ('pending','clean','infected','error')),
  text_enc            bytea,                                             -- ข้อความที่สกัด + ตำแหน่ง (หน้า/ข้อ) เข้ารหัส — ไม่เข้า kb.chunks
  status              app.contract_status NOT NULL DEFAULT 'uploaded',
  counterparty_hint_enc bytea,                                           -- ชื่อคู่สัญญาที่สกัดได้ (แสดงในรายการ)
  retention_until     timestamptz,                                       -- จาก org_settings.contract_retention_days
  deleted_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_contracts_org_list  ON app.contracts(org_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX ix_contracts_retention ON app.contracts(retention_until) WHERE deleted_at IS NULL AND retention_until IS NOT NULL;

CREATE TABLE app.contract_reviews (
  id                        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contract_id               uuid NOT NULL REFERENCES app.contracts(id) ON DELETE CASCADE,
  org_id                    uuid NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,   -- denormalized เพื่อตรวจ tenant
  requested_by              bigint NOT NULL REFERENCES app.users(id),
  status                    text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','stopped')),
  summary_enc               bytea,                    -- สรุป 10 หัวข้อ (JSON) เข้ารหัส
  findings_enc              bytea,                    -- [{id, rule_code, severity, clause_ref, title, explanation, legal_basis, suggestion, feedback}] เข้ารหัส
  finding_counts            jsonb NOT NULL DEFAULT '{}',   -- {"high":2,"medium":3,"low":1} ใช้แสดงในรายการ
  rules_snapshot            jsonb,                    -- {rule_code: version_no}
  prompt_version_id         bigint REFERENCES kb.prompt_versions(id),
  verification              jsonb,                    -- finding ที่ verifier ตัด + เหตุผล
  input_tokens              int, output_tokens int, cost_usd numeric(12,6),
  latency_first_finding_ms  int, latency_total_ms int,
  started_at                timestamptz, finished_at timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_contract_reviews_contract ON app.contract_reviews(contract_id, created_at DESC);

CREATE TABLE app.counsel_shares (                                      -- share_to_counsel (FR-ORG-010)
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id           uuid NOT NULL REFERENCES app.organizations(id) ON DELETE CASCADE,
  resource_type    text NOT NULL CHECK (resource_type IN ('chat','contract_review')),
  resource_id      text NOT NULL,                                        -- chat uuid | contract_reviews.id
  from_user_id     bigint NOT NULL REFERENCES app.users(id),
  to_user_id       bigint NOT NULL REFERENCES app.users(id),             -- ต้องเป็น org_counsel ขององค์กรเดียวกัน
  note_enc         bytea,
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','closed')),
  reply_enc        bytea,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_counsel_shares_inbox ON app.counsel_shares(to_user_id, status, created_at DESC);

-- GRANT (ตาม matrix §2.7.1): lc_web SIUD org tables/contracts/counsel_shares, S kb.review_rules (published) + SIU (CMS);
-- lc_ai S contracts(text_enc)/review_rules, SIU contract_reviews; lc_worker S,U,D contracts/contract_reviews (extract, purge)
