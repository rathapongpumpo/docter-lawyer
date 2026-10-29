-- 2.3.4 Knowledge base: courts & prescription rules — `0004_kb_court.sql`
-- Source: docs/03-technical-spec.md §2.3 (keep in sync; forward-only)

CREATE TABLE kb.courts (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code              text NOT NULL UNIQUE,              -- 'civil_south_bkk', 'kwaeng_pathumwan'
  name_th           text NOT NULL COLLATE "th-TH-x-icu",
  name_en           text,
  court_system      text NOT NULL CHECK (court_system IN ('justice','administrative','constitutional','military')),
  court_type        text NOT NULL CHECK (court_type IN (
                      'supreme','appeal','regional_appeal','specialized_appeal',
                      'civil','criminal','provincial','kwaeng','juvenile_family',
                      'labour','tax','ip_it','bankruptcy','corruption',
                      'admin_supreme','admin_central','admin_regional','constitutional','military')),
  parent_id         bigint REFERENCES kb.courts(id),
  province_code     text,
  jurisdiction_area jsonb NOT NULL DEFAULT '{}',       -- {"province":["10"],"amphoe":["1001","1002"]} ตามประกาศเขตอำนาจ
  address           text,
  phone             text,
  url               text,
  lat               numeric(9,6),
  lng               numeric(9,6),
  efiling_supported boolean NOT NULL DEFAULT false,
  verified_at       date,
  status            kb.content_status NOT NULL DEFAULT 'draft',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_courts_type_prov ON kb.courts(court_type, province_code) WHERE status = 'published';
CREATE INDEX ix_courts_area      ON kb.courts USING gin (jurisdiction_area jsonb_path_ops);

CREATE TABLE kb.prescription_rules (
  id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code                    text NOT NULL,          -- 'tort_general', 'loan_general', 'labour_wages'
  category_id             smallint NOT NULL REFERENCES kb.categories(id),
  claim_type_th           text NOT NULL,
  claim_type_en           text,
  period_value            int  NOT NULL CHECK (period_value > 0),
  period_unit             text NOT NULL CHECK (period_unit IN ('day','month','year')),
  start_event_th          text NOT NULL,          -- "นับแต่วันที่ผู้เสียหายรู้ถึงการละเมิดและรู้ตัวผู้จะพึงต้องใช้ค่าสินไหมทดแทน"
  long_stop_value         int,                    -- อายุความขั้นสูง (ถ้ามี) เช่น 10 ปีนับแต่วันทำละเมิด
  long_stop_unit          text CHECK (long_stop_unit IN ('day','month','year')),
  long_stop_event_th      text,
  legal_basis_section_ids bigint[] NOT NULL DEFAULT '{}',
  exceptions_md           text,
  interruption_notes_md   text,                   -- การสะดุดหยุด/ขยายอายุความ (อธิบาย)
  urgency_days_warning    int NOT NULL DEFAULT 60,-- เตือนระดับ urgent เมื่อเหลือ ≤ N วัน
  effective_from          date NOT NULL,
  effective_to            date,
  status                  kb.content_status NOT NULL DEFAULT 'draft',
  reviewed_by             bigint,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, effective_from)
);
