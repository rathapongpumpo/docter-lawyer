-- 2.3.7 Saved items & progress — `0007_app_user_content.sql`
-- Source: docs/03-technical-spec.md §2.3 (keep in sync; forward-only)

CREATE TABLE app.saved_folders (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       bigint NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  is_collapsed  boolean NOT NULL DEFAULT false,
  sort_order    int NOT NULL DEFAULT 0,
  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.bookmarks (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      bigint NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  folder_id    bigint REFERENCES app.saved_folders(id) ON DELETE SET NULL,
  item_type    app.saved_item_type NOT NULL,
  item_id      text NOT NULL,                        -- bigint/uuid/slug ตาม item_type
  title        text NOT NULL,                        -- snapshot ชื่อ ณ ตอนบันทึก
  note         text CHECK (char_length(note) <= 1000),
  is_pinned    boolean NOT NULL DEFAULT false,
  sort_order   int NOT NULL DEFAULT 0,
  deleted_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_bookmarks_item ON app.bookmarks(user_id, item_type, item_id) WHERE deleted_at IS NULL;
CREATE INDEX ix_bookmarks_list ON app.bookmarks(user_id, folder_id, is_pinned DESC, sort_order) WHERE deleted_at IS NULL;

CREATE TABLE app.learning_progress (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       bigint NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  course_slug   text NOT NULL,                       -- ใช้ slug เพื่อรอดการออกเวอร์ชันใหม่ของ course
  lesson_slug   text NOT NULL,
  lesson_id     bigint REFERENCES kb.lessons(id) ON DELETE SET NULL,
  status        app.progress_status NOT NULL DEFAULT 'in_progress',
  best_score    int CHECK (best_score BETWEEN 0 AND 100),
  attempts      int NOT NULL DEFAULT 0,
  last_answers  jsonb,                               -- {"q_id":["a"]} ล่าสุด
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_slug, lesson_slug)
);

CREATE TABLE app.guide_progress (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        bigint NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  guide_slug     text NOT NULL,
  guide_id       bigint REFERENCES kb.guides(id) ON DELETE SET NULL,  -- เวอร์ชันที่ใช้ล่าสุด
  checked_items  text[] NOT NULL DEFAULT '{}',       -- keys ของ documents/steps ที่ติ๊กแล้ว
  completed_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, guide_slug)
);
