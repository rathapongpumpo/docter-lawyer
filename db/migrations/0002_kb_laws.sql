-- 2.3.2 Knowledge base: taxonomy & laws — `0002_kb_laws.sql`
-- Source: docs/03-technical-spec.md §2.3 (keep in sync; forward-only)

CREATE TABLE kb.categories (
  id            smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code          text NOT NULL UNIQUE CHECK (code ~ '^[A-Z]+(\.[A-Z0-9_]+)*$'), -- 'FAMILY', 'FAMILY.DIVORCE'
  parent_id     smallint REFERENCES kb.categories(id),
  name_th       text NOT NULL COLLATE "th-TH-x-icu",
  name_en       text NOT NULL,
  description_th text,
  description_en text,
  icon          text,                         -- key ใน components/icons/category-icons.ts (lucide-react)
  sort_order    int  NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_categories_parent ON kb.categories(parent_id, sort_order);

CREATE TABLE kb.laws (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  law_code            text NOT NULL UNIQUE CHECK (law_code ~ '^[a-z0-9_]+$'),  -- 'ccc','pc','cpc','crpc','land_code','lpa_2541','pdpa_2562'
  law_type            kb.law_type NOT NULL,
  title_th            text NOT NULL,
  title_en            text,
  short_name_th       text,                 -- 'ป.พ.พ.'
  aliases             text[] NOT NULL DEFAULT '{}',   -- {'ปพพ','ประมวลแพ่ง','แพ่งและพาณิชย์'}
  year_be             int CHECK (year_be BETWEEN 2400 AND 2700),
  primary_category_id smallint REFERENCES kb.categories(id),
  category_ids        smallint[] NOT NULL DEFAULT '{}',
  official_url        text,
  is_repealed         boolean NOT NULL DEFAULT false,
  repealed_on         date,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_laws_aliases_gin   ON kb.laws USING gin (aliases);
CREATE INDEX ix_laws_title_trgm    ON kb.laws USING gin (title_th gin_trgm_ops);
CREATE INDEX ix_laws_categories    ON kb.laws USING gin (category_ids);

CREATE TABLE kb.law_versions (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  law_id           bigint NOT NULL REFERENCES kb.laws(id),
  version_label    text NOT NULL,           -- 'ฉบับรวมแก้ไขถึง (ฉบับที่ 24) พ.ศ. 2565'
  amendment_title  text,                    -- ชื่อกฎหมายแก้ไขที่ทำให้เกิดเวอร์ชันนี้
  gazette_ref      text,                    -- 'เล่ม 139 ตอนที่ 20 ก หน้า 1'
  gazette_url      text,
  promulgated_on   date,
  effective_from   date NOT NULL,
  effective_to     date,                    -- NULL = ยังมีผลอยู่
  status           kb.content_status NOT NULL DEFAULT 'draft',
  source_file_path text,
  source_sha256    text,
  parse_report     jsonb NOT NULL DEFAULT '{}',   -- จำนวนมาตรา, คำเตือน parser
  diff_summary     jsonb NOT NULL DEFAULT '{}',   -- {added:[..], amended:[..], repealed:[..]}
  created_by       bigint,                  -- FK app.users (เพิ่มใน 0005 หลังสร้าง users)
  reviewed_by      bigint,
  published_at     timestamptz,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  -- เวอร์ชันที่ published ของกฎหมายเดียวกันห้ามมีช่วงเวลามีผลทับกัน
  CONSTRAINT ex_law_versions_no_overlap EXCLUDE USING gist (
      law_id WITH =,
      daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
  ) WHERE (status = 'published')
);
CREATE INDEX ix_law_versions_law ON kb.law_versions(law_id, effective_from DESC);

CREATE TABLE kb.law_sections (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  law_version_id  bigint NOT NULL REFERENCES kb.law_versions(id) ON DELETE CASCADE,
  law_id          bigint NOT NULL REFERENCES kb.laws(id),          -- denormalized เพื่อ query เร็ว
  section_no      text NOT NULL CHECK (section_no ~ '^[0-9]+(/[0-9]+)?( (ทวิ|ตรี|จัตวา|เบญจ|ฉ|สัตต|อัฏฐ|นว|ทศ))?$'),
  sort_key        int[] NOT NULL,           -- '1336/1' → {1336,1,0}; '4 ทวิ' → {4,0,2}
  structure_path  jsonb NOT NULL DEFAULT '[]',  -- [{"level":"บรรพ","no":"5","title":"ครอบครัว"},{"level":"ลักษณะ","no":"2",...}]
  heading         text,                     -- หัวเรื่อง (ถ้ามี)
  body            text NOT NULL,            -- ตัวบทตามต้นฉบับ (เลขไทยแปลงเป็นอารบิกเฉพาะใน body_tokens)
  body_tokens     text NOT NULL DEFAULT '', -- PyThaiNLP tokens คั่น space
  change_type     kb.section_change NOT NULL DEFAULT 'unchanged',
  is_repealed     boolean NOT NULL DEFAULT false,
  effective_from  date NOT NULL,            -- copy จาก version (อาจต่างได้ถ้ามาตรามีบทเฉพาะกาล)
  effective_to    date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (law_version_id, section_no)
);
CREATE INDEX ix_law_sections_lookup ON kb.law_sections(law_id, section_no, effective_from DESC);
CREATE INDEX ix_law_sections_order  ON kb.law_sections(law_version_id, sort_key);
CREATE INDEX ix_law_sections_body_trgm ON kb.law_sections USING gin (body gin_trgm_ops);
