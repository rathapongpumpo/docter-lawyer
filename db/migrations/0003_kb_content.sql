-- 2.3.3 Knowledge base: content — `0003_kb_content.sql`
-- Source: docs/03-technical-spec.md §2.3 (keep in sync; forward-only)

CREATE TABLE kb.articles (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug               text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  category_id        smallint NOT NULL REFERENCES kb.categories(id),
  extra_category_ids smallint[] NOT NULL DEFAULT '{}',
  level              kb.content_level NOT NULL DEFAULT 'basic',
  current_version_id bigint,                -- FK ใส่หลังสร้าง article_versions (DEFERRABLE)
  is_featured        boolean NOT NULL DEFAULT false,
  review_due_at      date,                  -- วันที่ต้องทบทวนความถูกต้อง (ค่าเริ่ม +12 เดือน)
  view_count         bigint NOT NULL DEFAULT 0,
  deleted_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE kb.article_versions (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  article_id    bigint NOT NULL REFERENCES kb.articles(id) ON DELETE CASCADE,
  version_no    int NOT NULL,
  locale        text NOT NULL DEFAULT 'th' CHECK (locale IN ('th','en')),
  title         text NOT NULL,
  summary       text,                       -- ≤ 300 ตัวอักษร ใช้ใน card และ meta description
  body_md       text NOT NULL,
  sources       jsonb NOT NULL DEFAULT '[]',-- [{"kind":"law_section","law_code":"ccc","section_no":"420"}, {"kind":"url","url":"…","title":"…"}]
  content_hash  text NOT NULL,              -- sha256(title||body_md) — import idempotent
  status        kb.content_status NOT NULL DEFAULT 'draft',
  author_id     bigint,
  reviewer_id   bigint,
  change_note   text,
  submitted_at  timestamptz,
  published_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (article_id, locale, version_no)
);
CREATE UNIQUE INDEX ux_article_versions_one_published
  ON kb.article_versions(article_id, locale) WHERE status = 'published';
ALTER TABLE kb.articles ADD CONSTRAINT fk_articles_current_version
  FOREIGN KEY (current_version_id) REFERENCES kb.article_versions(id) DEFERRABLE INITIALLY DEFERRED;

-- ---------- row-per-version pattern: guides / templates / courses ----------
CREATE TABLE kb.guides (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug           text NOT NULL CHECK (slug ~ '^[a-z0-9-]+$'),
  version_no     int  NOT NULL DEFAULT 1,
  locale         text NOT NULL DEFAULT 'th',
  category_id    smallint NOT NULL REFERENCES kb.categories(id),
  title          text NOT NULL,
  summary        text,
  -- โครงสร้างมาตรฐานคู่มือ (01-blueprint §M5):
  -- {"eligibility":"md","documents":[{"key":"id_card","label":"บัตรประชาชน","required":true,"note":"…"}],
  --  "locations":[{"label":"สำนักงานเขต/อำเภอ","help_agency_slug":null,"url":null}],
  --  "fees":[{"label":"…","amount_text":"…","source_ref":{"kind":"law_section",...}}],
  --  "steps":[{"key":"s1","title":"…","body_md":"…"}], "duration_text":"…",
  --  "cautions":["md"], "faq":[{"q":"…","a_md":"…"}], "legal_basis":[{"kind":"law_section","law_code":"ccc","section_no":"1457"}],
  --  "related":{"templates":["…"],"court_tools":["…"],"articles":["…"]}}
  body           jsonb NOT NULL,
  status         kb.content_status NOT NULL DEFAULT 'draft',
  author_id      bigint,
  reviewer_id    bigint,
  review_due_at  date,
  published_at   timestamptz,
  deleted_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slug, locale, version_no)
);
CREATE UNIQUE INDEX ux_guides_one_published ON kb.guides(slug, locale) WHERE status = 'published';
CREATE INDEX ix_guides_category ON kb.guides(category_id) WHERE status = 'published';

CREATE TABLE kb.templates (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug               text NOT NULL CHECK (slug ~ '^[a-z0-9-]+$'),
  version_no         int  NOT NULL DEFAULT 1,
  locale             text NOT NULL DEFAULT 'th',
  category_id        smallint NOT NULL REFERENCES kb.categories(id),
  title              text NOT NULL,
  description_md     text,
  docx_template_path text,                  -- docxtpl template (Jinja tags) ใน volume
  static_file_path   text,                  -- P1: ไฟล์ดาวน์โหลดสำเร็จรูป
  -- wizard: [{"key":"lender_name","type":"text|number|date|select|boolean|address|id_card",
  --           "label":"…","help_md":"ช่องนี้มีผลอย่างไร","required":true,"validation":{...},"show_if":"…","pii":true}]
  fields_schema      jsonb NOT NULL DEFAULT '[]',
  -- [{"key":"interest_cap","when":"interest_rate_pa > 15","level":"warning","message_key":"tpl.warn.interest", "source_ref":{...}}]
  risk_rules         jsonb NOT NULL DEFAULT '[]',
  output_formats     text[] NOT NULL DEFAULT '{docx,pdf}',
  legal_basis        jsonb NOT NULL DEFAULT '[]',
  status             kb.content_status NOT NULL DEFAULT 'draft',
  author_id          bigint,
  reviewer_id        bigint,
  review_due_at      date,
  published_at       timestamptz,
  deleted_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slug, locale, version_no)
);
CREATE UNIQUE INDEX ux_templates_one_published ON kb.templates(slug, locale) WHERE status = 'published';

CREATE TABLE kb.courses (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug           text NOT NULL CHECK (slug ~ '^[a-z0-9-]+$'),
  version_no     int  NOT NULL DEFAULT 1,
  locale         text NOT NULL DEFAULT 'th',
  title          text NOT NULL,
  description_md text,
  level          kb.content_level NOT NULL DEFAULT 'basic',
  category_ids   smallint[] NOT NULL DEFAULT '{}',
  cover_image    text,
  est_minutes    int,
  badge_code     text,
  sort_order     int NOT NULL DEFAULT 0,
  status         kb.content_status NOT NULL DEFAULT 'draft',
  author_id      bigint,
  reviewer_id    bigint,
  published_at   timestamptz,
  deleted_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slug, locale, version_no)
);
CREATE UNIQUE INDEX ux_courses_one_published ON kb.courses(slug, locale) WHERE status = 'published';

CREATE TABLE kb.lessons (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  course_id     bigint NOT NULL REFERENCES kb.courses(id) ON DELETE CASCADE,  -- ผูกกับ "แถวเวอร์ชัน" ของ course
  slug          text NOT NULL,
  position      int  NOT NULL,
  title         text NOT NULL,
  body_md       text NOT NULL,
  est_minutes   int,
  sources       jsonb NOT NULL DEFAULT '[]',
  pass_score    int NOT NULL DEFAULT 60 CHECK (pass_score BETWEEN 0 AND 100),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, slug),
  UNIQUE (course_id, position)
);

CREATE TABLE kb.quiz_questions (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lesson_id       bigint NOT NULL REFERENCES kb.lessons(id) ON DELETE CASCADE,
  position        int NOT NULL,
  qtype           text NOT NULL CHECK (qtype IN ('mcq','true_false','multi_select')),
  prompt_md       text NOT NULL,
  choices         jsonb NOT NULL,            -- [{"key":"a","text":"…"}]
  correct_keys    text[] NOT NULL,
  explanation_md  text NOT NULL,             -- เฉลยพร้อมเหตุผล
  source_ref      jsonb,                     -- {"kind":"law_section","law_code":"ccc","section_no":"19"}
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, position)
);

CREATE TABLE kb.glossary_terms (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug                text NOT NULL UNIQUE,
  term_th             text NOT NULL COLLATE "th-TH-x-icu",
  term_en             text,
  aliases             text[] NOT NULL DEFAULT '{}',    -- ใช้ highlight ในคำตอบ AI
  short_def           text NOT NULL,                   -- ≤ 160 ตัวอักษร (tooltip)
  long_def_md         text,
  category_ids        smallint[] NOT NULL DEFAULT '{}',
  related_section_ids bigint[] NOT NULL DEFAULT '{}',  -- kb.law_sections.id
  status              kb.content_status NOT NULL DEFAULT 'draft',
  published_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_glossary_term_trgm ON kb.glossary_terms USING gin (term_th gin_trgm_ops);
CREATE INDEX ix_glossary_aliases   ON kb.glossary_terms USING gin (aliases);

CREATE TABLE kb.help_agencies (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug           text NOT NULL UNIQUE,
  name_th        text NOT NULL COLLATE "th-TH-x-icu",
  name_en        text,
  agency_type    text NOT NULL CHECK (agency_type IN ('government','court','council','ngo','university_clinic','hotline','police','other')),
  topics         text[] NOT NULL DEFAULT '{}',       -- category codes
  province_codes text[],                             -- NULL = ทั่วประเทศ; รหัสจังหวัด 2 หลักตาม DOPA
  phone          text,
  hotline        text,                               -- '1300'
  email          text,
  url            text,
  line_id        text,
  address        text,
  hours_text     text,
  services_md    text,
  is_emergency   boolean NOT NULL DEFAULT false,     -- แสดงใน safety_notice
  is_free        boolean NOT NULL DEFAULT true,
  verified_at    date,
  verified_by    bigint,
  status         kb.content_status NOT NULL DEFAULT 'draft',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_help_topics    ON kb.help_agencies USING gin (topics);
CREATE INDEX ix_help_provinces ON kb.help_agencies USING gin (province_codes);
