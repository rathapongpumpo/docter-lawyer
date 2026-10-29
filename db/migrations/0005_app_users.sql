-- 2.3.5 Users, auth & settings — `0005_app_users.sql`
-- Source: docs/03-technical-spec.md §2.3 (keep in sync; forward-only)

CREATE TABLE app.users (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email               citext NOT NULL,                -- anonymous user ได้อีเมลชั่วคราวที่ Better Auth สร้าง
  email_verified      boolean NOT NULL DEFAULT false, -- Better Auth
  email_verified_at   timestamptz,                    -- ตั้งโดย databaseHooks
  display_name        text NOT NULL,                  -- Better Auth "name"
  avatar_path         text,                           -- Better Auth "image" (object key ใน MinIO)
  role                app.user_role NOT NULL DEFAULT 'member',   -- admin plugin (member/editor/reviewer/admin)
  status              app.user_status NOT NULL DEFAULT 'pending_verification',
  is_anonymous        boolean NOT NULL DEFAULT false, -- anonymous plugin = guest
  guest_uuid          uuid UNIQUE,                    -- ค่า guest_id ที่ใช้ในตารางอื่นขณะเป็น guest (ออกตอน sign-in anonymous)
  two_factor_enabled  boolean NOT NULL DEFAULT false, -- twoFactor plugin (บังคับ staff)
  banned              boolean NOT NULL DEFAULT false, -- admin plugin
  ban_reason          text,
  ban_expires         timestamptz,
  last_login_at       timestamptz,
  failed_login_count  int NOT NULL DEFAULT 0,
  locked_until        timestamptz,
  deletion_requested_at timestamptz,                  -- ขอลบบัญชี → status=pending_deletion
  deletion_scheduled_at timestamptz,                  -- = requested + 30 วัน; login ก่อนเวลานี้ยกเลิกได้ (cancel_account_deletion)
  deleted_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_users_email_active ON app.users(email) WHERE deleted_at IS NULL;
CREATE INDEX ix_users_deletion_due ON app.users(deletion_scheduled_at) WHERE status = 'pending_deletion';
CREATE INDEX ix_users_role ON app.users(role) WHERE role <> 'member';
CREATE INDEX ix_users_anonymous_created ON app.users(created_at) WHERE is_anonymous;   -- purge guest > GUEST_RETENTION_HOURS

-- Better Auth: sessions (cookie lc_session = session token ที่ sign ด้วย BETTER_AUTH_SECRET; Redis secondaryStorage เป็น cache)
CREATE TABLE app.sessions (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         bigint NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  token           text NOT NULL UNIQUE,
  expires_at      timestamptz NOT NULL,                -- absolute timeout (12 ชม. / remember-me 30 วัน)
  ip_address      text,                                -- เก็บแบบ truncate /24 (PDPA)
  user_agent      text,
  impersonated_by bigint REFERENCES app.users(id),     -- admin plugin (ปิดใช้ใน P1)
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_sessions_user ON app.sessions(user_id);
CREATE INDEX ix_sessions_expires ON app.sessions(expires_at);

-- Better Auth: accounts (provider 'credential' เก็บ password hash argon2id; 'google' / 'line' ใน P2)
CREATE TABLE app.accounts (
  id                        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id                   bigint NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  account_id                text NOT NULL,
  provider_id               text NOT NULL CHECK (provider_id IN ('credential','google','line')),
  password                  text,                     -- argon2id (custom password.hash) เฉพาะ credential
  access_token              text,
  refresh_token             text,
  id_token                  text,
  access_token_expires_at   timestamptz,
  refresh_token_expires_at  timestamptz,
  scope                     text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, account_id)
);
CREATE INDEX ix_accounts_user ON app.accounts(user_id);

-- Better Auth: verifications (ยืนยันอีเมล / reset password) — แทน app.auth_tokens เดิม
CREATE TABLE app.verifications (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  identifier  text NOT NULL,
  value       text NOT NULL,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_verifications_identifier ON app.verifications(identifier);

-- Better Auth twoFactor plugin (TOTP + backup codes) — secret/backup codes ถูกเข้ารหัสโดย Better Auth ด้วย BETTER_AUTH_SECRET
CREATE TABLE app.two_factors (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       bigint NOT NULL UNIQUE REFERENCES app.users(id) ON DELETE CASCADE,
  secret        text NOT NULL,
  backup_codes  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.user_consents (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       bigint REFERENCES app.users(id) ON DELETE CASCADE,
  guest_id      uuid,                                -- consent ของ guest (service_terms/privacy_notice)
  purpose       app.consent_purpose NOT NULL,
  doc_version   text NOT NULL,                       -- เวอร์ชันของข้อความนโยบาย เช่น 'privacy-2026-09'
  granted       boolean NOT NULL,
  granted_at    timestamptz NOT NULL DEFAULT now(),
  withdrawn_at  timestamptz,
  ip_hash       bytea,                               -- sha256(ip || pepper)
  user_agent    text,
  CHECK (user_id IS NOT NULL OR guest_id IS NOT NULL)
);
CREATE INDEX ix_consents_user ON app.user_consents(user_id, purpose, granted_at DESC);

CREATE TABLE app.user_settings (
  user_id              bigint PRIMARY KEY REFERENCES app.users(id) ON DELETE CASCADE,
  locale               text NOT NULL DEFAULT 'th' CHECK (locale IN ('th','en','lo','my','vi','zh','ja','ko')),
  theme                text NOT NULL DEFAULT 'system' CHECK (theme IN ('light','dark','system')),
  explain_level        app.explain_level NOT NULL DEFAULT 'simple',
  default_scope        text[] NOT NULL DEFAULT '{}',  -- ว่าง = auto
  last_chat_id         uuid,
  right_panel_open     boolean NOT NULL DEFAULT false,
  email_notifications  boolean NOT NULL DEFAULT true,
  province_code        text,                          -- ใช้กรอง M9/M7 (ไม่บังคับ)
  text_scale           smallint NOT NULL DEFAULT 100 CHECK (text_scale IN (100, 112, 125, 150)),  -- ขนาดตัวอักษร (%) สำหรับผู้สูงอายุ
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- ค่าตั้งค่าระดับระบบ (แก้ผ่านหน้า `/admin/ai` (รวม announcement); ทุกการแก้ลง audit_log) — ไม่ใช่ค่าของผู้ใช้
CREATE TABLE app.system_settings (
  key          text PRIMARY KEY CHECK (key ~ '^[a-z0-9_.]+$'),  -- 'quota.guest_daily', 'ai.effort_main', 'flags.clarifying_questions', 'announcement.banner', 'safety.prefilter_keywords'
  value        jsonb NOT NULL,
  description  text,
  updated_by   bigint REFERENCES app.users(id),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
-- ค่าจาก env เป็น default; ถ้ามี key ในตารางนี้ ให้ใช้ค่าในตารางแทน (ยกเว้น model ID และ secret ที่อ่านจาก env เท่านั้น)

-- FK ย้อนหลังสำหรับ kb.* ที่อ้าง users
ALTER TABLE kb.law_versions     ADD FOREIGN KEY (created_by)  REFERENCES app.users(id),
                                ADD FOREIGN KEY (reviewed_by) REFERENCES app.users(id);
ALTER TABLE kb.article_versions ADD FOREIGN KEY (author_id)   REFERENCES app.users(id),
                                ADD FOREIGN KEY (reviewer_id) REFERENCES app.users(id);
-- (ทำแบบเดียวกันกับ guides, templates, courses, help_agencies.verified_by, court_fee_schedules.reviewed_by, prescription_rules.reviewed_by)
