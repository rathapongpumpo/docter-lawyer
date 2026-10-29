-- 2.3.9 Retrieval index, reviews, prompts, eval — `0009_kb_index_ops.sql`
-- Source: docs/03-technical-spec.md §2.3 (keep in sync; forward-only)

CREATE TABLE kb.chunks (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_type      kb.chunk_source NOT NULL,
  source_id        bigint NOT NULL,                  -- law_sections.id / articles.id / guides.id / …
  source_version   bigint NOT NULL,                  -- law_version_id / article_version_id / guides.version_no
  law_id           bigint,                           -- สำหรับ filter ตามกฎหมาย
  category_ids     smallint[] NOT NULL DEFAULT '{}',
  locale           text NOT NULL DEFAULT 'th',
  chunk_index      int NOT NULL DEFAULT 0,
  title            text NOT NULL,                    -- 'ป.พ.พ. มาตรา 420' / ชื่อบทความ › หัวข้อ
  content          text NOT NULL,                    -- ข้อความที่ส่งให้ LLM
  content_tokens   text NOT NULL,                    -- PyThaiNLP tokens คั่น space (lexical)
  tsv              tsvector GENERATED ALWAYS AS (to_tsvector('simple', title || ' ' || content_tokens)) STORED,
  embedding        vector(1024) NOT NULL,
  embedding_model  text NOT NULL DEFAULT 'BAAI/bge-m3',
  token_count      int NOT NULL,
  effective_from   date,
  effective_to     date,
  is_published     boolean NOT NULL DEFAULT true,
  metadata         jsonb NOT NULL DEFAULT '{}',      -- {"law_code":"ccc","section_no":"420","url":"…","level":"basic","structure_path":[…]}
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_id, source_version, chunk_index)
);
CREATE INDEX ix_chunks_embedding ON kb.chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX ix_chunks_tsv       ON kb.chunks USING gin (tsv);
CREATE INDEX ix_chunks_trgm      ON kb.chunks USING gin (content gin_trgm_ops);
CREATE INDEX ix_chunks_cats      ON kb.chunks USING gin (category_ids);
CREATE INDEX ix_chunks_source    ON kb.chunks(source_type, source_id);
CREATE INDEX ix_chunks_current   ON kb.chunks(source_type, law_id) WHERE is_published AND effective_to IS NULL;
-- query ตัวอย่าง (dense): SET hnsw.ef_search = 100;
-- SELECT id, 1 - (embedding <=> $1) AS score FROM kb.chunks
--  WHERE is_published AND (effective_to IS NULL OR effective_to >= $as_of) AND effective_from <= $as_of
--    AND ($scope = '{}' OR category_ids && $scope)
--  ORDER BY embedding <=> $1 LIMIT 40;

-- พจนานุกรมคำพ้อง/คำย่อศัพท์กฎหมาย สำหรับ query rewrite (§4.5) — ดูแลโดย editor/reviewer
CREATE TABLE kb.synonyms (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  term           text NOT NULL,                      -- 'ปพพ', 'โดนไล่ออก', 'เงินชดเชย'
  canonical      text NOT NULL,                      -- 'ป.พ.พ.', 'เลิกจ้าง', 'ค่าชดเชย'
  category_code  text REFERENCES kb.categories(code),-- NULL = ใช้ได้ทุกหมวด
  kind           text NOT NULL CHECK (kind IN ('abbreviation','synonym','colloquial')),
  status         kb.content_status NOT NULL DEFAULT 'draft',
  created_by     bigint REFERENCES app.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (term, canonical)
);
CREATE INDEX ix_synonyms_term ON kb.synonyms(term) WHERE status = 'published';
CREATE INDEX ix_synonyms_trgm ON kb.synonyms USING gin (term gin_trgm_ops);

CREATE TABLE kb.content_reviews (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  content_type  text NOT NULL CHECK (content_type IN ('article','law_version','guide','template','course','glossary','judgment','help_agency','court','court_fee','prescription_rule','prompt_version')),
  content_id    bigint NOT NULL,                     -- id ของแถวเวอร์ชันนั้น (article_versions.id, guides.id, …)
  action        kb.review_action NOT NULL,
  actor_id      bigint REFERENCES app.users(id),
  comment       text,
  precheck      jsonb,                               -- ผล ai_precheck: {"unknown_refs":[…],"numbers_to_verify":[…],"readability":…}
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_reviews_content ON kb.content_reviews(content_type, content_id, created_at);
CREATE INDEX ix_reviews_queue   ON kb.content_reviews(action, created_at DESC);

CREATE TABLE kb.prompt_versions (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name           text NOT NULL CHECK (name IN ('answer_system','triage','rewrite','suggestions','title','precheck','template_explain','summarize_history','contract_segment','contract_review')),
  locale         text NOT NULL DEFAULT 'th',
  version_no     int NOT NULL,
  body           text NOT NULL,
  params         jsonb NOT NULL DEFAULT '{}',        -- {"model_env":"LC_MODEL_MAIN","effort":"high","max_tokens":16000}
  status         kb.prompt_status NOT NULL DEFAULT 'draft',
  eval_summary   jsonb,                              -- ผล eval ล่าสุดของเวอร์ชันนี้
  created_by     bigint REFERENCES app.users(id),
  activated_by   bigint REFERENCES app.users(id),
  activated_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, locale, version_no)
);
CREATE UNIQUE INDEX ux_prompt_one_active ON kb.prompt_versions(name, locale) WHERE status = 'active';

CREATE TABLE kb.eval_cases (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  set_name            text NOT NULL CHECK (set_name IN ('core_th','safety_th','refusal_scope','citation_th','regression')),
  locale              text NOT NULL DEFAULT 'th',
  category_code       text,
  question            text NOT NULL,
  conversation        jsonb,                         -- multi-turn (ถ้ามี)
  expected_points     jsonb NOT NULL DEFAULT '[]',   -- ["ต้องบอกว่าอายุความ 1 ปีนับแต่รู้…", …]
  must_cite           text[] NOT NULL DEFAULT '{}',  -- {'ccc:420','ccc:448'}
  must_not            jsonb NOT NULL DEFAULT '[]',   -- ["ฟันธงผลคดี", "อ้างมาตราที่ไม่มีจริง"]
  expected_safety     text,                          -- NULL | 'urgent:domestic_violence' | …
  expected_guardrail  text,                          -- NULL | 'blocked'
  origin              text NOT NULL CHECK (origin IN ('manual','feedback','synthetic')),
  source_feedback_id  bigint REFERENCES app.message_feedback(id) ON DELETE SET NULL,
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
  created_by          bigint REFERENCES app.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_eval_cases_set ON kb.eval_cases(set_name) WHERE status = 'active';

-- เพิ่มเติมจากรายการตารางหลัก: ผลการรัน eval
CREATE TABLE kb.eval_runs (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  set_name           text NOT NULL,
  prompt_version_id  bigint REFERENCES kb.prompt_versions(id),
  model              text NOT NULL,
  effort             text,
  git_sha            text,
  status             text NOT NULL DEFAULT 'running' CHECK (status IN ('running','done','failed')),
  metrics            jsonb,          -- {"citation_accuracy":0.97,"hallucinated_ref_rate":0.002,"answer_score":4.4,"safety_recall":1.0,"cost_usd":…}
  results            jsonb,          -- ผลรายข้อ: [{case_id, pass, scores, notes, reviewer_verdict}]
  reviewed_by        bigint REFERENCES app.users(id),  -- Legal Reviewer ที่ตรวจผล (human review ของ eval)
  reviewed_at        timestamptz,
  review_notes       text,
  started_by         bigint REFERENCES app.users(id),
  started_at         timestamptz NOT NULL DEFAULT now(),
  finished_at        timestamptz
);
ALTER TABLE app.message_feedback ADD FOREIGN KEY (added_to_eval_id) REFERENCES kb.eval_cases(id) ON DELETE SET NULL;
ALTER TABLE app.messages        ADD FOREIGN KEY (prompt_version_id) REFERENCES kb.prompt_versions(id);
ALTER TABLE app.llm_calls       ADD FOREIGN KEY (prompt_version_id) REFERENCES kb.prompt_versions(id);
