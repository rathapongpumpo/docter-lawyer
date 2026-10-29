# CLAUDE.md — Legal Consult TH (ชื่อชั่วคราว: "นิติมิตร")

> ไฟล์นี้คือ "กติกากลาง" ของโปรเจกต์ สำหรับ developer และ AI coding agent (Claude Code) ทุกคน
> อ่านไฟล์นี้ก่อนเริ่มงานทุกครั้ง แล้วอ่าน `docs/01-blueprint.md` → `docs/02-srs.md` → `docs/03-technical-spec.md` (ตามส่วนที่เกี่ยวกับงาน)
> สถานะปัจจุบัน (2026-10-01): **ระบบบัญชี M1 + แชท M2 (ตอบจากคลังความรู้แบบ extractive + ตัวเสริมจาก API ฐานความรู้ของบริษัท) + คลังความรู้ M3 (บทความ/ตัวบท/อภิธานศัพท์ + tooltip) + คู่มือขั้นตอน M5 (ติ๊กความก้าวหน้า; เปิดจากลิงก์อ้างอิง/ขั้นตอนถัดไป/ที่บันทึกไว้ ไม่มีในเมนูด้านข้าง) + แบบหนังสือ M6 (wizard → DOCX·PDF) + หลังบ้าน M10 + องค์กร M11 + ตรวจสัญญา M12 (รับไฟล์/อ่าน/แยกข้อ + ตรวจรายข้อและสรุปสาระสำคัญ — ตัวเลือก `CONTRACT_REVIEW_BACKEND=off|mock|http|pnc`; `pnc` = ส่งแต่ละข้อ (ปกปิด PII แล้ว) ไปถาม API แชทของบริษัท ได้ข้อมูลเบื้องต้นแบบข้อความ ไม่มีระดับความเสี่ยงและไม่มีแหล่งอ้างอิง; `mock` เป็นผลจำลองติดป้ายในหน้าจอ; API ตรวจสัญญาเฉพาะของบริษัท (`http`) ยังไม่ได้เชื่อมต่อ) + hardening (rate limit/kill switch/compose production+Caddy/backup+restore-test/metrics/k6/axe) + PDPA** — เนื้อหาในคลังความรู้ทั้ง 43 ชิ้น (บทความ/ตัวบท/คู่มือ/แบบหนังสือ/ศัพท์) ยังเป็น **ฉบับร่าง** ไม่มีชิ้นใดผ่านผู้ตรวจ; ระบบทดสอบตั้ง `KB_SERVE_DRAFTS=true` จึงแสดงเนื้อหาร่างพร้อมป้าย "ฉบับร่าง" ทุกหน้า · คำตอบแชทปกติมาจากการค้นคลังความรู้ (hybrid retrieval bge-m3 + lexical, PII masking, safety prefilter) แต่เมื่อตั้ง `PNC_PRIMARY=true` (ระบบทดสอบตั้งไว้) แชทถาม API ฐานความรู้ของบริษัทก่อนและแสดงคำตอบนั้นโดย**ไม่มีป้ายบอกแหล่ง ไม่มีรายการอ้างอิง ไม่มีคำถามต่อ/ขั้นตอนถัดไป** (ยังมี "ข้อมูล ณ วันที่" และข้อความว่าไม่ใช่คำปรึกษาเฉพาะกรณี) · `web/` (Next.js 16) + `ai/` (FastAPI) + `worker` (reindex, purge guest/บัญชีที่ขอลบ, ตัวตั้งเวลา) · migrations `0001–0026` · git (`main`) · แผนเฟส `docs/03-technical-spec.md` §9.4 · ค้างจากภายนอก: VM/โดเมน/SMTP จริง, pentest, ผู้ตรวจเนื้อหาที่เป็นนักกฎหมาย

---

## 1. ระบบนี้คืออะไร (สรุปใน 30 วินาที)

แพลตฟอร์ม **ข้อมูลกฎหมายและผู้ช่วยตอบคำถามจากคลังความรู้ที่ผู้ตรวจเนื้อหาดูแล สำหรับองค์กรและบุคคล** (คำตอบมาจากการค้นคลังความรู้ที่มีอ้างอิง ส่วนบางคำตอบ/บล็อกเสริมมาจาก API ฐานความรู้ของบริษัทซึ่งไม่มีแหล่งอ้างอิง — ดูสถานะปัจจุบันด้านบน) — **กลุ่มหลักเฟสแรกคือองค์กรธุรกิจ SME–ขนาดกลาง** ที่ไม่มีฝ่ายกฎหมาย
**ขอบเขตกฎหมายเฟสแรก = สัญญาทางการค้าและการผิดสัญญา** (ค่าปรับส่งมอบงานล่าช้า, ซัพพลายเออร์ส่งของไม่ได้มาตรฐานแต่เลิกสัญญาไม่ได้, ถูกเลิกสัญญากะทันหัน)
ช่วยให้ เข้าใจสัญญาก่อนเซ็น → รู้สิทธิเมื่อคู่สัญญาผิดสัญญา → ส่งหนังสือ/ดำเนินการถูกขั้นตอน → รู้ว่าเมื่อไรต้องส่งเรื่องให้ทนาย
เฟส 1 = pilot กับองค์กรนำร่อง 3–5 แห่ง (2027-01-12); บริการบุคคลทั่วไปเต็มรูปแบบและหมวดกฎหมายอื่นอยู่ในเฟส 2

ประกอบด้วยโมดูลที่สร้างแล้วดังนี้ (รายละเอียดใน `docs/01-blueprint.md`)

| รหัส | โมดูล | สรุป |
|---|---|---|
| M1 | Account & Access | สมัคร/เข้าสู่ระบบ, โหมด Guest, PDPA consent, โปรไฟล์, ภาษา, ธีม |
| **M2** | **Legal Chat (แกนหลัก)** | แชทถาม-ตอบแบบ streaming ที่ตอบจากคลังความรู้ (extractive) พร้อมอ้างอิงมาตรา/บทความ, จัดการประวัติแชท |
| M3 | Knowledge Library | คลังความรู้แยกตามหมวดกฎหมาย (ปัจจุบันมี 4 หมวดที่มีเนื้อหา: หนี้และสัญญา, บุคคลและนิติกรรม, คุ้มครองผู้บริโภค, กระบวนการยุติธรรมและวิธีพิจารณาความ — ทุกชิ้นเป็นฉบับร่าง): บทความ, ตัวบท (มาตรา), อภิธานศัพท์ (ต้องล็อกอินก่อนจึงเปิดอ่านได้) |
| M5 | Procedure Guides | คู่มือแบบทีละขั้น พร้อมติ๊กเอกสาร/ขั้นตอนที่ทำแล้ว (ไม่มีในเมนูซ้าย เปิดจากลิงก์ในแบบหนังสือ/แหล่งอ้างอิง/ที่บันทึกไว้) |
| M6 | Document Templates | แบบหนังสือ กรอกผ่าน wizard → DOCX/PDF |
| M10 | Back-office (Admin CMS) | จัดการเนื้อหา, นำเข้าตัวบท, review workflow, ผู้ใช้, audit log, คำขอใช้สิทธิ PDPA, feedback, guardrail log, การใช้งาน, ประกาศระบบ, สวิตช์ฉุกเฉิน |
| **M11** | **Organization Workspace** | องค์กร, สมาชิก, role ระดับองค์กร (`org_owner/org_admin/org_member/org_counsel`), visibility, quota, audit, retention, ส่งเรื่องให้ที่ปรึกษากฎหมายขององค์กร |
| **M12** | **Contract Review** | อัปโหลดสัญญา (PDF/DOCX) → สแกนไวรัส/เข้ารหัส → อ่านข้อความและแยกเป็นข้อ → ปุ่ม "ตรวจสัญญา" ตรวจรายข้อ (ระบบทดสอบตั้ง backend `pnc`: การ์ดต่อข้อมี "ความเสี่ยง:" และ "วิธีแก้ไข:" เป็นข้อความจาก API บริษัท ไม่มีระดับความเสี่ยงและไม่มีแหล่งอ้างอิง; backend `mock` ให้ผลจำลองที่ติดป้ายและ `http` ยังไม่ได้เชื่อมต่อ ไม่ได้ตั้งไว้บนระบบทดสอบ) |

UX/UI ยึดตามระบบอ้างอิง **AI-EDW** (PromptNow) — สเปก UI ใน `docs/03-technical-spec.md` §5 และภาพตัวอย่างใน `docs/prototype/index.html`

---

## 2. กฎเหล็ก (Non-negotiables) — ห้ามละเมิดไม่ว่ากรณีใด

### 2.1 ด้านกฎหมายและจริยธรรม (สำคัญที่สุด)
1. **ระบบให้ "ข้อมูลกฎหมายทั่วไป" ไม่ใช่ "คำปรึกษาเฉพาะคดีจากทนายความ"** — ห้ามออกแบบฟีเจอร์ใดที่ทำให้ระบบ
   "ว่าความ" หรือ "เป็นตัวแทนผู้ใช้ต่อศาล" (เกี่ยวข้องกับ พ.ร.บ.ทนายความ พ.ศ. 2528) ฟีเจอร์ M6 เป็น "ผู้ช่วยให้ผู้ใช้ทำเอง"
   และต้องแนะนำให้ปรึกษาทนายความเมื่อเรื่องมีความเสี่ยงสูง (ดู `docs/03-technical-spec.md` §7.1)
2. **ห้ามระบบแต่งเลขมาตรา ชื่อกฎหมาย หรือตัวเลข (ค่าธรรมเนียม, อายุความ, โทษ) ขึ้นเอง** — ข้อเท็จจริงทางกฎหมายทุกข้อ
   ต้องมาจากเอกสารที่ค้นได้ในคลังความรู้และแสดงเป็น citation; ถ้าไม่มีแหล่งรองรับ ให้บอกว่า "ไม่พบข้อมูลยืนยัน" (ดู `docs/03-technical-spec.md` §4.7)
3. **ทุกคำตอบของระบบต้องมี**: (ก) citation ที่คลิกดูต้นฉบับได้ (ข) วันที่ของข้อมูล (as-of) (ค) disclaimer แบบสั้น — ยกเว้นคำตอบจาก API ฐานความรู้ของบริษัท ซึ่งไม่มีแหล่งอ้างอิง (citation) และไม่ต้องติดป้ายกำกับ (ปรับกฎเมื่อ 2026-10-01 ตามผู้ดูแลโครงการ; `docs/03-technical-spec.md` §7.15)
4. **เนื้อหาในคลังความรู้ (M3, M5, M6) ต้องผ่านการอนุมัติของผู้ตรวจเนื้อหา (role `reviewer` — ก่อนเริ่ม pilot ต้องเป็นนักกฎหมาย) ก่อน publish** (สถานะ `draft → in_review → published`) — ระบบห้าม publish เอง
5. **เรื่องเร่งด่วน/อันตราย** (ความรุนแรงในครอบครัว, ถูกจับกุม, ถูกขู่ทำร้าย, คิดทำร้ายตัวเอง, ใกล้หมดอายุความ/กำหนดยื่น)
   ต้องแสดง safety notice + ช่องทางช่วยเหลือเสมอ (SSE event `safety_notice`)
6. ตัวบทกฎหมายมี **เวอร์ชันตามวันมีผลบังคับใช้** (`effective_from/effective_to`) — ห้ามลบของเก่า ให้ปิดเวอร์ชันแทน
6a. **ข้อความในระบบ/เอกสารต้องเป็นจริง:** ห้ามอ้างว่าเนื้อหา/ผลตรวจผ่านการตรวจหรือรับรองใดที่ยังไม่เกิดขึ้นจริง (เช่น "ตรวจโดยนักกฎหมาย") และห้ามข้อความ demo/สาธิตในหน้าจอ production (BR-027)
6b. **ข้อความทางกฎหมายทุกข้อต้องอ้างแหล่งใน `docs/knowledge-base/`** (ตัวบทพร้อมแหล่งที่มาและวันที่ดึง) — ไม่มีแหล่ง = ไม่เขียน/ไม่แสดง
6c. **ข้อมูลองค์กรแยกกันเด็ดขาด** (`org_id` + `requireOrgMember` ในทุก endpoint/หน้าองค์กร) และไม่นำสัญญา/ข้อมูลองค์กรไปใช้นอกวัตถุประสงค์ของบริการ

### 2.2 ด้านข้อมูลส่วนบุคคล (PDPA)
7. ข้อความแชทและสัญญาที่ผู้ใช้อัปโหลดอาจมีข้อมูลอ่อนไหว (PDPA ม.26) — ต้องมี consent ก่อนใช้งาน, สัญญาที่อัปโหลดเข้ารหัส at-rest, และ **mask PII** (บัตรประชาชน, เบอร์โทร, เลขบัญชี, อีเมล) ก่อนค้นหา ก่อนบันทึก log และก่อนส่งข้อความออกไปยังระบบภายนอกใด ๆ ตาม `docs/03-technical-spec.md` §4.3, §7.2
8. ห้าม log ข้อความแชทดิบลง application log — log เฉพาะ id, latency, verdict
9. ห้ามใส่ credential/secret ใดๆ ลง git — ใช้ `.env` (มี `.env.example`) — ไฟล์รหัสผ่านของระบบอ้างอิง AI-EDW (เดิม `docs/ex01`) ย้ายออกจาก repo แล้วไปที่ `~/.config/legal-consult/` (2026-09-29) ห้ามนำกลับเข้า repo

### 2.3 ด้านวิศวกรรม
10. Web tier ห้ามเรียกระบบภายนอกเพื่อตอบคำถามตรง (รวม API ฐานความรู้ของบริษัท) — ผ่าน **AI service (`ai/`)** เท่านั้น
11. ทุก Route Handler ที่เปลี่ยนสถานะต้องตรวจ **session (Better Auth) + Origin + CSRF token** (header `X-CSRF-Token`) และ **ownership** ของ resource; validate input ด้วย zod
12. Output ที่มาจากคำตอบของระบบ/ผู้ใช้/API ภายนอก ต้อง render ผ่าน `react-markdown` + `rehype-sanitize` (allow-list) เท่านั้น — ห้าม `dangerouslySetInnerHTML` กับข้อความดิบ
13. ข้อความ UI ทุกตัวต้องผ่าน `next-intl` (`web/messages/th.json`, `en.json`) — ห้าม hard-code ภาษาไทย/อังกฤษใน component
14. สีทุกสีต้องใช้ CSS token (`--primary`, `--surface`, …) และต้องทำงานทั้ง light/dark theme

---

## 3. Tech Stack (ตัดสินใจแล้ว 2026-09-24: เปลี่ยน web tier เป็น Next.js — เหตุผลใน ADR ของ `docs/03-technical-spec.md` §1)

| Layer | เทคโนโลยี | หมายเหตุ |
|---|---|---|
| Web (frontend + BFF) | **Next.js (App Router) + React + TypeScript strict**, Node 22, pnpm, `output: 'standalone'` | แทน PHP เดิม; SSR สำหรับหน้าความรู้ (SEO), Route Handlers `/api/v1/*` เป็น API เดียว |
| UI | Tailwind CSS v4 + lucide-react; next-themes; next-intl; react-markdown + remark-gfm + rehype-sanitize | token สี/เลย์เอาต์ตาม AI-EDW (CSS variables) |
| Forms / data | zod (schema ใช้ร่วม client/server); TanStack Query | |
| Auth | **Better Auth** (email+password, `anonymous` = guest, `twoFactor` TOTP สำหรับ staff, `admin` roles) | session ใน Postgres, cookie `lc.session_token` (+ `lc_csrf` สำหรับ CSRF) |
| ORM | Drizzle ORM (รองรับ pgvector) — schema generate จาก SQL migrations | `db/migrations/*.sql` คือแหล่งความจริง |
| AI service | Python 3.12 + FastAPI + Uvicorn | retrieval, คำตอบแบบ extractive, guardrails (PII mask, safety triage), SSE streaming, อ่าน/แยกข้อสัญญา, ตรวจสัญญา (backend `off|mock|http|pnc`), สร้างไฟล์ DOCX/PDF |
| Embedding | `BAAI/bge-m3` (self-host, รองรับภาษาไทย, dense 1024-d) | container `embed-m3`; hybrid กับ lexical search |
| Thai NLP | PyThaiNLP (ตัดคำสำหรับ lexical search + normalize เลขไทย/พ.ศ.) | |
| Database | PostgreSQL 16 + `pgvector` + `pg_trgm` | schema `app` (ผู้ใช้/แชท) และ `kb` (ความรู้); DB role แยกต่อ service: `lc_web`, `lc_ai`, `lc_worker` (+ `lc_owner` สำหรับ migration) |
| Rate-limit | Redis 7 (ioredis + rate-limiter-flexible) | ตัวนับ rate limit เท่านั้น (quota รายวันอยู่ใน Postgres `app.usage_counters`; session อยู่ใน Postgres) |
| Jobs | ตาราง `app.jobs` + worker Python (`SELECT … FOR UPDATE SKIP LOCKED`) | reindex/ingest เนื้อหาและตัวบท, อ่านและตรวจสัญญา, purge (guest, บัญชี/องค์กรที่ขอลบ, สัญญา, ลิงก์แชร์ที่หมดอายุ) |
| Doc generation | `python-docx` (DOCX) + `fpdf2` + HarfBuzz (PDF, ฟอนต์ TH Sarabun New) ใน AI service | M6; PDF/พิมพ์แชทและคู่มือใช้พิมพ์จากเบราว์เซอร์ |
| File storage | MinIO (S3-compatible, bucket `lc-private`) + ClamAV | สัญญาที่อัปโหลด (เข้ารหัส) |
| Email | Nodemailer | verify, reset, เชิญสมาชิก, แจ้งเตือน — ส่งจริงเมื่อตั้ง SMTP จริงเท่านั้น; ลิงก์ลืมรหัสผ่าน ฟอร์มเชิญสมาชิก และแถบยืนยันอีเมลแสดงเมื่อ `MAIL_LIVE=true` หรือ `SMTP_HOST` ไม่ใช่เครื่องนี้/mailpit (สคริปต์ e2e ตั้ง `MAIL_LIVE=true`) |
| Deploy | Docker Compose บน Ubuntu 24.04 + **Caddy** (TLS, reverse proxy, ปิด buffering ให้ SSE) | `deploy/` |
| Test / Observability | Vitest, Playwright (+axe), k6, pytest · pino, prom-client | |

---

## 4. โครงสร้าง Repository

```
legal-consult/
├── CLAUDE.md                     ← ไฟล์นี้
├── .env.example
├── docs/                         ← 01-blueprint, 02-srs, 03-technical-spec, 04-user-guide, 05-quick-guide, business/, prototype/, knowledge-base/
├── web/                          ← Next.js app (TypeScript)
│   ├── app/
│   │   ├── (auth)/                   ← /login /register /forgot-password /reset-password /accept-invitation /consent /two-factor
│   │   ├── (app)/layout.tsx          ← app shell: sidebar, header, footer (ตาม AI-EDW)
│   │   ├── (app)/chat/[[...chatId]]/ ← หน้าแชท (หน้าแรกหลัง login; / → /chat)
│   │   ├── (app)/library/ law/ guides/ templates/ saved/ contracts/ org/ settings/   (guides ไม่อยู่ในเมนูซ้าย)
│   │   ├── (app)/admin/              ← back-office (editor/reviewer/admin)
│   │   ├── legal/[doc]  print/[chatId]  share/[token]/   ← ข้อกำหนด/ประกาศ (ฉบับร่าง), หน้าพิมพ์, แชทที่แชร์ (อ่านอย่างเดียว)
│   │   ├── api/v1/**/route.ts        ← REST API (operationId = ชื่อ action เช่น get_chat_history)
│   │   ├── api/v1/chat/stream/route.ts ← SSE proxy → ai service
│   │   ├── api/auth/[...all]/route.ts  ← Better Auth
│   │   ├── api/healthz  readyz  metrics
│   │   └── globals.css  layout.tsx  sitemap.ts  robots.ts
│   ├── components/                   ← shell/ chat/ kb/ law/ contracts/ org/ account/ auth/ share/ admin/
│   ├── lib/                          ← db/ auth.ts rate-limit.ts csrf.ts storage.ts crypto.ts logger.ts ops.ts ฯลฯ
│   ├── messages/                     ← th.json en.json
│   ├── proxy.ts  next.config.ts  drizzle.config.ts
│   ├── tests/                        ← Vitest + สคริปต์ e2e/smoke (Playwright, axe)
│   └── package.json
├── ai/                           ← Python AI service
│   ├── app/
│   │   ├── main.py               ← FastAPI app
│   │   ├── api/                  ← routers: chat (SSE), kb (search), documents (render), health
│   │   ├── rag/                  ← embed, retrieve (hybrid), tokens
│   │   ├── answer/               ← extractive answer engine
│   │   ├── guardrails/           ← pii mask, safety triage
│   │   ├── kb/                   ← importer, law import/parse, rebuild (chunks), refs, source files, thai helpers
│   │   ├── contracts/            ← อ่านและแยกข้อสัญญา (extract), ตรวจสัญญา (review: backend mock/http/pnc)
│   │   ├── docgen/               ← DOCX/PDF ของแบบหนังสือ
│   │   ├── external/             ← company_kb (API ฐานความรู้ของบริษัท, ตัวเสริม)
│   │   └── core/                 ← config, db, logging, storage, crypto, mail, metrics
│   ├── worker/                   ← job runner
│   ├── eval/                     ← extractive_check, retrieval_eval, golden/ (ชุดทดสอบ retrieval)
│   ├── tests/                    ← pytest
│   └── pyproject.toml
├── db/
│   ├── migrations/               ← NNNN_description.sql (forward-only)
│   └── seeds/
├── docs/knowledge-base/          ← เนื้อหาต้นฉบับ (ตัวบท, บทความ, คู่มือ, แบบหนังสือ, อภิธานศัพท์) — นำเข้าด้วย seed-kb
├── scripts/                      ← db-migrate, check, e2e-*, backup/restore, loadtest, set-role ...
└── deploy/                       ← docker-compose.yml, docker-compose.dev.yml, Caddyfile, backup/, monitoring/, pm2/
```

---

## 5. คำสั่งที่ใช้บ่อย

เปิดเว็บทดสอบที่ `http://192.168.31.21:3200` (ดูด้านล่าง) · พัฒนาหน้าเว็บแบบ hot reload: `cd web && pnpm dev` (เฉพาะเครื่อง dev — staging ใช้ `pnpm build && pm2 startOrReload` เท่านั้น) · production: `deploy/docker-compose.yml` + `deploy/Caddyfile` (ขั้นตอนใน `docs/03-technical-spec.md` §7.13)

**Dev บนเครื่องนี้:** postgres/redis/ai ใน compose dev, web รัน `pnpm dev` บน host
```bash
docker compose --env-file .env -f deploy/docker-compose.dev.yml up -d --build   # postgres :55432, redis :56379, ai :8200, embed-m3 (bge-m3, ภายใน), mailpit :58025, minio :59000/:59001, clamav :53310
scripts/db-migrate.sh                                           # ใช้ db/migrations/*.sql ที่ยังไม่รัน (มี checksum)
set -a; . ./.env; set +a; docker compose --env-file .env -f deploy/docker-compose.dev.yml exec -e DB_USER=lc_worker -e DB_PASSWORD="$DB_WORKER_PASSWORD" ai python -m app.cli seed-kb --path /kb   # นำเข้า docs/knowledge-base (idempotent)
docker compose --env-file .env -f deploy/docker-compose.dev.yml exec ai python -m eval.extractive_check   # ตรวจการเลือกคำตอบหลังแก้ KB/เกณฑ์
scripts/set-role.sh <email> <editor|reviewer|admin>                # ให้สิทธิ์ทีมงาน (เมนู "หลังบ้าน" /admin) — มี audit log; บัญชีต้องสมัครก่อน
scripts/check.sh                                                # ตรวจทั้งหมดก่อน commit: gitleaks, web typecheck/lint/test, ai ruff/pytest
scripts/e2e-review.sh                                           # ทดสอบ workflow ตรวจเนื้อหาบน DB สำเนา (ไม่แตะข้อมูลจริง)
scripts/e2e-admin.sh                                            # ทดสอบหลังบ้าน (สิทธิ์ต่อเมนู/ผู้ใช้/audit ที่ DB ห้ามแก้/DSR + digest/feedback + consent/guardrail/usage/ประกาศ + API ของ workflow ตรวจเนื้อหา)
scripts/e2e-content.sh                                          # ทดสอบ editor: autosave/ล็อก/diff → worker สร้าง chunks → ฉบับเก่าถูกถอดจากการค้นหา → importer ไม่ทับ
scripts/e2e-law.sh                                              # ทดสอบนำเข้าตัวบท: PDF แบบราชกิจจาฯ → parse (≥99%) → draft → อนุมัติ → ปิดฉบับเก่า + ตั้งธงทบทวน
scripts/e2e-library.sh                                          # ทดสอบคลังความรู้: หมวด/ค้นหา (ผ่าน AI จริง)/อภิธานศัพท์+tooltip/คู่มือติ๊ก/พิมพ์/wizard→DOCX·PDF (ตรวจไฟล์ + ว่าข้อความไม่ตกใน log/ตาราง)/มือถือ
docker compose --env-file .env -f deploy/docker-compose.dev.yml exec ai python -m eval.retrieval_eval [--show-misses]   # ชุดทดสอบ retrieval 151 เคส (ไม่ใช้โมเดล); สร้างใหม่ด้วย eval.build_retrieval_set หลังแก้ KB
scripts/e2e-ops.sh                                              # ทดสอบ kill switch (แชท guest/ทั้งหมด/อัปโหลด) + rate limit รายนาที + audit
scripts/e2e-a11y.sh                                             # axe WCAG 2.1 A/AA 31 หน้า × 4 ชุดแสดงผล (desktop สว่าง/มืด ไทย, มือถือ สว่าง ไทย, desktop สว่าง อังกฤษ) = 124 ชุด (ต้อง 0 serious/critical)
scripts/rehearse-prod.sh                                        # ซ้อม production: web image จริงหลัง Caddy + TLS (headers, cookie, SSE ผ่าน proxy)
scripts/backup.sh && scripts/restore-test.sh                    # สำรองเข้ารหัส + พิสูจน์ว่ากู้ได้ (ห้ามลืมเก็บ .env/APP_KEY_* นอกเครื่อง)
scripts/loadtest.sh [normal|stress]                             # k6 (SCALE=0.35 ≈ pilot); ผลอยู่ใน spec §7.13 E
scripts/security-scan.sh                                        # pnpm/pip audit + gitleaks + ZAP baseline (ตรวจภายใน ไม่ใช่ pentest)
scripts/e2e-contract.sh                                         # ทดสอบสัญญา (อัปโหลด/ClamAV EICAR/เข้ารหัส/MinIO/worker/สิทธิ์/ลบ/retention/ลบองค์กร + ตรวจสัญญาด้วย backend `mock`) — ต้องมี minio + clamav ใน compose dev
scripts/e2e-chat.sh                                             # ทดสอบแชททั้งชุด (ประวัติ/โฟลเดอร์/feedback/ที่บันทึก/regenerate/scope/stream พื้นหลัง/แชร์ลิงก์) กับ AI service จริงบน DB สำเนา
scripts/e2e-org.sh                                              # ทดสอบองค์กร + tenant isolation (เชิญ/บทบาท/visibility/ส่งให้ที่ปรึกษา/quota/audit/ลบองค์กร) บน DB สำเนา
scripts/e2e-account.sh                                          # ทดสอบระบบบัญชีทั้งชุด (สมัคร/ยืนยัน/รีเซ็ต/ล็อก/2FA/consent/ลบบัญชี) บน DB สำเนา; อ่านอีเมลจาก mailpit http://127.0.0.1:58025
cd web && corepack pnpm install && corepack pnpm run db:pull     # db:pull เมื่อ schema DB เปลี่ยน (ห้ามแก้ lib/db/generated ด้วยมือ)
corepack pnpm dev                                                # http://localhost:3200 (.env.local → ../.env)
# ห้าม export .env เข้า shell ก่อน build (NODE_ENV=development ทำให้ build พัง) — ให้ Next อ่าน .env.local เอง
corepack pnpm run build && pm2 startOrReload ../deploy/pm2/ecosystem.config.cjs   # เว็บทดสอบ (pm2: legal-consult-web) http://192.168.31.21:3200 (LAN) / http://100.64.16.111:3200 (Tailscale) — IP ต้องอยู่ใน EXTRA_TRUSTED_ORIGINS
pm2 logs legal-consult-web                                        # ห้าม `next dev`/`pnpm start` ซ้อนบน port 3200 ขณะ pm2 รันอยู่
corepack pnpm run typecheck && corepack pnpm run lint && corepack pnpm run test
docker compose --env-file .env -f deploy/docker-compose.dev.yml exec ai pytest -q
docker run --rm --network host -v $PWD:/w -w /w mcr.microsoft.com/playwright:v1.63.0-noble node tests/screens.mjs   # smoke + screenshot → web/test-results/screens
```

### สภาพแวดล้อม (ตรวจเครื่องเมื่อ 2026-09-24)
- **Dev + staging** รันบนเครื่องปัจจุบัน (Ubuntu 24.04 VM, 8 vCPU, RAM 31 GB แต่ว่างจริง ~13 GB, ไม่มี GPU, ใช้ร่วมกับโปรเจกต์อื่น) — ต้องตั้ง `mem_limit` ทุก service (dev รวม ~10 GB) และ**ห้ามใช้ port ที่มีคนใช้แล้ว** (3306, 3308, 5433, 3014, 3041, 4100, 4101, 20005, 20006, 31051–31056, 41051, 41057)
- **Production** ต้องเป็น VM แยก: ขั้นต่ำ 8 vCPU / 32 GB / SSD 200 GB (แนะนำ GPU T4/L4 สำหรับ embedding) ข้อมูลอยู่ในประเทศไทย
- เว็บตัวบททางการบล็อกการดึงอัตโนมัติ (403 / SSL ไม่สมบูรณ์) → เฟส 1 ให้ทีมเนื้อหาดาวน์โหลด PDF ทางการแล้ว upload ผ่านหลังบ้าน

---

## 6. Conventions

- **ภาษา**: เอกสารเป็นภาษาไทย ใช้ศัพท์เทคนิคภาษาอังกฤษได้; โค้ด, ชื่อตัวแปร, commit message เป็นภาษาอังกฤษ; comment ภาษาอังกฤษ
- **วันที่**: เก็บเป็น UTC (`timestamptz`) แสดงผลเป็น **พ.ศ.** เมื่อ locale = th (เช่น 24 ก.ย. 2569)
- **เลขมาตรา**: เก็บเป็น text normalized (`"420"`, `"1336/1"`, `"4 ทวิ"`) แสดงผล `มาตรา 420`
- **API**: Route Handlers `/api/v1/<resource>` แต่ละ endpoint มี `operationId` = ชื่อ action เดิม (เช่น `chat_stream` = `POST /api/v1/chat/stream`) คืน `{success, data?, error?, error_code?, build}` — สเปกเต็มใน `docs/03-technical-spec.md` §3
- **SSE events**: `chat_id, status, safety_notice, chunk, citations, suggestions, guardrail, complete, title_update, error` (payload ตาม `docs/03-technical-spec.md` §3.3–3.4)
- **ชื่อทุกอย่าง** (ตาราง, enum, action, env, SSE field, law code): ดู **`docs/03-technical-spec.md` §0.2 (Naming registry)** ก่อนตั้งชื่อใหม่ — ห้ามตั้งชื่อซ้ำซ้อน/ต่างจาก registry
- **DB**: snake_case, PK `bigint generated always as identity` (ยกเว้นที่ระบุ `uuid`), ทุกตารางมี `created_at/updated_at`, soft-delete ด้วย `deleted_at`
- **TypeScript**: strict, ESLint + Prettier; Server Components เป็นค่าเริ่มต้น ใส่ `'use client'` เฉพาะที่จำเป็น; DB access เฉพาะใน server (`lib/db`), ห้าม import ฝั่ง client
- **Python**: ruff + mypy (ตั้งใน `ai/pyproject.toml`), pydantic v2 models
- **React**: component ต่อฟีเจอร์ใน `components/<module>/`; component เขียนเองด้วย Tailwind + CSS token (ไม่มี shadcn/ui); ทุกปุ่มไอคอนต้องมี `aria-label`
- **CSS**: Tailwind utilities ที่อ้าง token (`bg-surface`, `text-muted` …) เท่านั้น ห้ามใส่ hex ตรงๆ; breakpoint 1024 / 768 / 576 / 480
- **Git**: branch `feat/<module>-<short>`, `fix/…`; Conventional Commits; PR ต้องอ้าง requirement ID เช่น `FR-CHAT-004`
- **Requirement IDs**: `FR-<MODULE>-NNN`, `NFR-<CAT>-NNN` นิยามใน `docs/02-srs.md` — ทุก PR/test อ้างถึง ID

## 7. Definition of Done
- [ ] ตรงตาม acceptance criteria ของ requirement ID ใน SRS
- [ ] Unit test ผ่าน; ถ้าแตะ `ai/rag` หรือ `ai/app/answer` ต้องรัน `eval.extractive_check` และ `eval.retrieval_eval` และผลไม่ต่ำกว่า baseline (`docs/03-technical-spec.md` §4.10)
- [ ] ใช้งานได้ทั้ง light/dark, desktop/mobile (≤480px), ภาษาไทย/อังกฤษ
- [ ] หน้าใหม่มีไอคอนแท็บ (favicon) และชื่อแท็บ (`generateMetadata`) — `web/tests/screens.mjs` ตรวจ `<link rel=icon>` ให้อัตโนมัติ
- [ ] ไม่มีข้อความ UI hard-code, ไม่มี secret, ไม่มี log ข้อความดิบของผู้ใช้
- [ ] อัปเดตเอกสารใน `docs/` ถ้าพฤติกรรม/สเปกเปลี่ยน (เอกสารต้องตรงกับโค้ดเสมอ)

## 8. แผนที่เอกสาร

| ไฟล์ | อ่านเมื่อ |
|---|---|
| `docs/01-blueprint.md` | เริ่มต้น — ภาพรวมผลิตภัณฑ์, กลุ่มลูกค้าองค์กร, persona, journey, โมดูล M1–M12, IA, 18 หมวดกฎหมาย, phase, Open Decisions |
| `docs/02-srs.md` | ข้อกำหนด FR/NFR/BR + acceptance criteria + traceability (ทุก PR อ้าง ID จากไฟล์นี้) |
| `docs/03-technical-spec.md` | วิธีสร้าง: naming registry §0, architecture §1, data model §2, API/SSE §3, AI/RAG §4, UI §5, content §6, security/PDPA §7, dev guide §8, roadmap §9 |
| `docs/04-user-guide.md` | คู่มือการใช้งานระบบทดสอบ (ผู้ใช้, ทีมเนื้อหา, ผู้ดูแลระบบ) + สิ่งที่ต้องมีจากภายนอก — อัปเดตทุกครั้งที่ฟีเจอร์ที่ผู้ใช้เห็นเปลี่ยน |
| `docs/05-quick-guide.md` | คู่มือสั้นสำหรับคนทั่วไป — ระบบคืออะไร, เมนูและฟีเจอร์ในแต่ละเมนู, บทบาทที่ทำอะไรได้ (ภาษาง่าย 1 หน้า) — อัปเดตเมื่อเมนู/บทบาทเปลี่ยน |
| `web/content/manual/manual.th.json` + `web/public/manual/img/` | คู่มือภาพประกอบทีละขั้นตอนแยกตามบทบาท (8 บทบาท 86 งาน) แสดงในระบบที่เมนู "คู่มือการใช้งาน" (ล่างสุดของแถบซ้าย, `/manual`, `/manual/<role>`) — แก้เนื้อหาที่ JSON, ภาพเป็น JPEG ในโฟลเดอร์ภาพ; วิธีเพิ่มงานอยู่ที่หัวไฟล์ `web/lib/manual.ts` |
| `docs/prototype/index.html` | clickable prototype สำหรับนำเสนอ/อ้างอิง UI (เปิดในเบราว์เซอร์) |
| `docs/business/BRD.md` | เอกสารความต้องการทางธุรกิจสำหรับผู้บริหาร |
| `docs/business/mvp-features.xlsx` | รายการฟีเจอร์ MVP ทั้งหมด (สรุปจาก SRS) |
| `docs/business/PromptNow_Confidential_Nitimitr_v1.0.2.pptx` | สไลด์นำเสนอระบบทดสอบ 15 สไลด์ (ภาพหน้าจอจริง, ฟีเจอร์ที่ทำแล้ว, บทบาท, ความปลอดภัย, สถานะก่อน pilot); ไฟล์ `…v1.0.1.pptx` คือเอกสารต้นทางฉบับเดิมที่ใช้กำหนดขอบเขต (อ้างใน `docs/knowledge-base/sources.md`) |
| `docs/knowledge-base/` | ฐานความรู้ต้นฉบับ (ตัวบท + แหล่งที่มา, บทความ, คู่มือ, อภิธานศัพท์) เฟส 1 = กฎหมายสัญญา — seed format ตาม `03-technical-spec.md` §6.2 |
