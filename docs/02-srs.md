# 02 — Software Requirements Specification (SRS)

| รายการ | ค่า |
|---|---|
| โปรเจกต์ | Legal Consult TH (ชื่อชั่วคราว "นิติมิตร" — คำโปรย "ข้อมูลกฎหมายสำหรับองค์กรและบุคคล") |
| เวอร์ชันเอกสาร | 1.8 (2026-10-01) |
| สถานะ | Baseline — ข้อกำหนดตรงกับสิ่งที่ระบบทำได้จริง ณ 2026-10-01 (คำตอบมาจากคลังความรู้แบบ extractive) |
| อ้างอิงแนวทาง | ISO/IEC/IEEE 29148:2018 (ปรับให้กระชับ) |
| แหล่งความจริงด้านชื่อ/รหัส | `CLAUDE.md`, `docs/01-blueprint.md` |

> **วิธีใช้เอกสารนี้**: ทุก PR, test case และ ticket ต้องอ้าง Requirement ID (`FR-…`, `NFR-…`, `BR-…`)
> หากต้องเปลี่ยน requirement ให้แก้เอกสารนี้ใน PR เดียวกับโค้ด และบันทึกใน §10 Change Log

---

## สารบัญ
1. Introduction
2. Overall Description
3. Functional Requirements
   - 3.1 FR-AUTH (M1 Account & Access)
   - 3.2 FR-CHAT (M2 แชทถามกฎหมาย — UI/พฤติกรรมแชท)
   - 3.3 FR-AI (พฤติกรรมเครื่องตอบ / Retrieval / Guardrails)
   - 3.4 FR-KB (M3 Knowledge Library)
   - 3.6 FR-GUIDE (M5 Procedure Guides)
   - 3.7 FR-TPL (M6 Document Templates)
   - 3.11 FR-ADM (M10 Back-office)
   - 3.12 FR-ORG (M11 Organization Workspace)
   - 3.13 FR-CR (M12 Contract Review)
4. External Interface Requirements
5. Non-functional Requirements
6. Data Requirements
7. Business Rules
8. Traceability Matrix
9. Appendix — อภิธานศัพท์กฎหมายที่ใช้ใน UI
10. Change Log

---

## 1. Introduction

### 1.1 Purpose
เอกสารนี้กำหนดข้อกำหนดเชิงหน้าที่ (Functional) และไม่ใช่เชิงหน้าที่ (Non-functional) ของระบบ Legal Consult TH
เพื่อให้ทีมพัฒนา (web, AI, QA), Legal Reviewer และเจ้าของผลิตภัณฑ์ มีความเข้าใจตรงกัน และใช้เป็นเกณฑ์ตรวจรับงาน

### 1.2 Scope
ระบบเป็นแพลตฟอร์มเว็บ (responsive, desktop + mobile browser) ที่ให้ **ข้อมูลกฎหมายไทยทั่วไป** จากคลังความรู้ที่จัดการโดยทีมเนื้อหา และรับ/อ่าน/แยกข้อสัญญา แก่ **องค์กร (กลุ่มหลัก) และบุคคล (กลุ่มรอง)**
**Phase 1 (pilot กับองค์กรนำร่อง 3–5 แห่ง, 2027-01-12)** จำกัดขอบเขตกฎหมายที่ **กฎหมายสัญญาทางการค้า**: หนี้และการผิดนัด, สัญญา มัดจำ เบี้ยปรับ การเลิกสัญญา, ซื้อขายและความชำรุดบกพร่อง, จ้างทำของ, อายุความของสิทธิเรียกร้องตามสัญญา, ค่าเสียหายและดอกเบี้ยผิดนัด, ข้อสัญญาที่ไม่เป็นธรรม, เขตอำนาจศาลแพ่ง (ป.วิ.พ. ม.4) — แหล่งตัวบทอยู่ใน `docs/knowledge-base/`
ความสามารถที่มีอยู่: (1) บัญชีผู้ใช้และ PDPA (M1) (2) แชทถามกฎหมายที่ตอบจากคลังความรู้พร้อมอ้างอิงตัวบท (M2 — ในระบบทดสอบที่เปิด `PNC_PRIMARY` คำตอบมาจากบริการฐานความรู้ของบริษัทก่อน ซึ่งหน้าจอไม่มีป้ายบอกแหล่งและไม่มีรายการอ้างอิง ดู §3.3) (3) คลังความรู้: บทความ ตัวบท อภิธานศัพท์ (M3) (4) คู่มือขั้นตอน (M5) (5) แบบหนังสือ → DOCX/PDF (M6) (6) ระบบหลังบ้าน (M10) (7) พื้นที่ทำงานองค์กร (M11) (8) รับไฟล์สัญญา อ่านข้อความ แยกเป็นข้อ และตรวจสัญญารายข้อพร้อมสรุปสาระสำคัญ (M12 — ผลตรวจมาจากตัวตรวจที่ตั้งค่าไว้ ดู §3.13)
หมวดกฎหมายอื่นตาม taxonomy 18 หมวด และบริการบุคคลทั่วไปเต็มรูปแบบอยู่นอกขอบเขตเฟสแรก

**สถานะเนื้อหาในระบบทดสอบ (ณ 2026-10-01):** หน้า "คลังความรู้" แสดง 4 หมวด — "บุคคลและนิติกรรม" (บทความ 3, ตัวบท 1), "หนี้และสัญญา" (บทความ 6, ตัวบท 2, แบบหนังสือ 5, คำศัพท์ 24), "คุ้มครองผู้บริโภค" (ตัวบท 1), "กระบวนการยุติธรรมและวิธีพิจารณาความ" (ตัวบท 1) รวมเนื้อหา 43 ชิ้นที่ทุกชิ้นยังเป็น "ร่าง" ไม่มีชิ้นที่เผยแพร่แล้ว (หน้า "งานตรวจเนื้อหา" แสดง รอตรวจ 0 · ร่าง 43 · เผยแพร่แล้ว 0) ระบบทดสอบเปิด `KB_SERVE_DRAFTS` จึงแสดงเนื้อหาร่างพร้อมป้าย "ฉบับร่าง" ในรายการและแบนเนอร์ "ฉบับร่าง — ยังไม่ผ่านผู้ตรวจเนื้อหา" ในหน้าเนื้อหา; ผู้ใช้ต้องล็อกอินก่อนจึงเปิดคลังความรู้และตัวบทได้ (หน้าที่เปิดได้โดยไม่ล็อกอินมีเฉพาะ `/legal/*` และ `/share/*`)

**นอกขอบเขต**: การว่าความหรือเป็นตัวแทนผู้ใช้ต่อศาล/หน่วยงาน, การร่างคำคู่ความ (คำฟ้อง คำให้การ คำร้อง) แทนผู้ใช้,
การยื่นเอกสารเข้าระบบของศาลแทนผู้ใช้, การรับประกันผลคดี, การให้คำปรึกษาเฉพาะกรณีเกี่ยวกับสัญญา (ผลตรวจสัญญาเป็นข้อมูลทั่วไปประกอบการพิจารณา), กฎหมายต่างประเทศ, การรับชำระเงิน
— สอดคล้องกับ พ.ร.บ.ทนายความ พ.ศ. 2528 (ดู `03-technical-spec.md` §7.1)

### 1.3 Definitions, Acronyms, Abbreviations

| คำ | ความหมาย |
|---|---|
| ป.พ.พ. | ประมวลกฎหมายแพ่งและพาณิชย์ (6 บรรพ) |
| ป.อ. | ประมวลกฎหมายอาญา |
| ป.วิ.พ. | ประมวลกฎหมายวิธีพิจารณาความแพ่ง |
| ป.วิ.อ. | ประมวลกฎหมายวิธีพิจารณาความอาญา |
| มาตรา (ม.) | หน่วยย่อยของตัวบทกฎหมาย; ในระบบเรียก "section" |
| ฎีกา / คำพิพากษาศาลฎีกา | คำวินิจฉัยของศาลสูงสุดในระบบศาลยุติธรรม ใช้เป็นแนวบรรทัดฐาน; ในระบบเรียก "judgment" |
| นิติกรรม | การกระทำโดยชอบด้วยกฎหมายและใจสมัคร มุ่งก่อความเคลื่อนไหวแห่งสิทธิ เช่น สัญญา พินัยกรรม |
| อายุความ | ระยะเวลาที่กฎหมายกำหนดให้ใช้สิทธิเรียกร้องทางศาล; ในระบบเรียก "prescription" |
| เขตอำนาจศาล | ศาลที่มีอำนาจรับคดีไว้พิจารณา; ในระบบเรียก "jurisdiction" |
| ทุนทรัพย์ | มูลค่าของทรัพย์สิน/จำนวนเงินที่พิพาทในคดีแพ่ง |
| PDPA | พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 |
| Extractive | วิธีตอบที่ระบบค้นคลังความรู้แล้วเลือก/เรียงข้อความที่มีอยู่แล้วมาแสดง (ไม่แต่งประโยคใหม่) |
| Citation | การอ้างอิงแหล่งที่มา (มาตรา/บทความ/คู่มือ) ที่ผูกกับข้อความในคำตอบ |
| TTFT | Time To First Token — เวลาตั้งแต่ส่งคำถามจนเห็นตัวอักษรแรกของคำตอบ |
| SSE | Server-Sent Events — โปรโตคอล streaming จาก server |
| As-of date | วันที่ของข้อมูลที่ใช้ตอบ (วันที่ตัวบท/เนื้อหาเวอร์ชันนั้นมีผล/ถูกตรวจทาน) |
| Legal Scope | ชุดหมวดกฎหมายที่ผู้ใช้เลือกให้ระบบค้น (แสดงเฉพาะหมวดที่มีเนื้อหา) |
| Safety notice | กล่องแจ้งช่องทางช่วยเหลือเร่งด่วนที่แสดงในแชท |
| Guardrail | กลไกตรวจ input/output เพื่อบล็อกเนื้อหาไม่เหมาะสม |
| MoSCoW | Must / Should / Could / Won't (this phase) |
| P0–P2 | Phase ของการพัฒนา (ดู `03-technical-spec.md` §9) |

### 1.4 References
| เอกสาร | เนื้อหา |
|---|---|
| `CLAUDE.md` | กฎเหล็ก, stack, conventions |
| `01-blueprint.md` | vision, persona, journey, โมดูล, IA, taxonomy |
| `03-technical-spec.md` | สเปกเทคนิครวมเล่ม: naming registry (§0.2 — ถ้าชื่อในเอกสารนี้ขัดกับ registry ให้ถือ registry เป็นหลัก), architecture/ADR (§1), data model/DDL (§2), Web API + SSE + AI service API (§3), retrieval/เครื่องตอบ extractive/citation/guardrail/eval (§4), UI spec (§5), taxonomy/content (§6), security/PDPA/ขอบเขตวิชาชีพ (§7), dev guide (§8), roadmap (§9) |
| `docs/prototype/index.html` | clickable prototype (ภาพ UI สำหรับนำเสนอ/อ้างอิง) |

### 1.5 รูปแบบการเขียน Requirement
```
#### FR-<MODULE>-NNN — <ชื่อ>
- คำอธิบาย: ระบบต้อง…
- Role: <roles> · Priority: Must|Should|Could|Won't · Phase: P0|P1|P2
- Acceptance Criteria:
  - AC1: Given … When … Then …
```
- "ระบบต้อง" = บังคับ, "ระบบควร" = Should, "ระบบอาจ" = Could
- Role `all` = guest, member, editor, reviewer, admin; `member+` = member ขึ้นไป (member, editor, reviewer, admin)

---

## 2. Overall Description

### 2.1 Product Perspective
ระบบใหม่ (greenfield) ที่ยืม UX/UI pattern จาก AI-EDW ประกอบด้วย 3 tier:
- **Web tier** — Next.js (App Router) + React + TypeScript (Node 22): หน้าเว็บ (Server Components, SSR), auth/session (Better Auth), CSRF, REST API (Route Handlers `/api/v1/...` — แต่ละ endpoint มี operationId = ชื่อ action เดิม), SSE proxy (`POST /api/v1/chat/stream`)
- **AI service** — Python FastAPI: hybrid retrieval, เครื่องตอบ extractive, guardrails, ตัวเสริมจาก API ฐานความรู้ของบริษัท (ติดป้ายกำกับ ปิดเป็นค่าเริ่มต้น — `03-technical-spec.md` §7.15), สร้างไฟล์แบบหนังสือ, อ่านสัญญา
- **Data** — PostgreSQL 16 (`app`, `kb` schemas + pgvector), Redis 7, embedding service (bge-m3), MinIO + ClamAV, worker

### 2.2 Product Functions (สรุป)
| โมดูล | หน้าที่หลัก |
|---|---|
| M1 | สมัคร/เข้าสู่ระบบ, Guest, PDPA consent, โปรไฟล์ (ชื่อ), ภาษา, ธีม, ขนาดตัวอักษร, 2FA, ส่งออก/ลบข้อมูล |
| M2 | แชทถามตอบ streaming ที่ตอบจากคลังความรู้ + citation + ประวัติแชท + แชร์ + feedback |
| M3 | คลังบทความ ตัวบท อภิธานศัพท์ + ค้นหา |
| M5 | คู่มือขั้นตอน + checklist (เปิดจากการอ้างอิง ขั้นตอนถัดไป และที่บันทึกไว้) |
| M6 | แบบหนังสือ + wizard + DOCX/PDF |
| M10 | CMS (แก้เนื้อหา, review workflow, นำเข้าตัวบท), feedback, guardrail log, ผู้ใช้, audit, DSR, การใช้งาน, ประกาศ, องค์กร, สวิตช์ฉุกเฉิน |
| M11 | พื้นที่ทำงานองค์กร: สมาชิก, role ระดับองค์กร, visibility, quota, audit, retention, สลับองค์กร, ส่งเรื่องให้ที่ปรึกษากฎหมายขององค์กร |
| M12 | สัญญา: อัปโหลด, สแกนไวรัส, เข้ารหัส, อ่านข้อความ, แยกข้อ, ตรวจรายข้อ, ลบ |

### 2.3 User Classes and Characteristics
| Role | ลักษณะ | ทักษะ | ความถี่ใช้งาน |
|---|---|---|---|
| `guest` | ประชาชนทั่วไปที่ยังไม่สมัคร | ใช้สมาร์ตโฟนเป็น, ไม่มีความรู้กฎหมาย | ครั้งคราว |
| `member` | ประชาชนที่สมัครสมาชิก | เหมือน guest | ครั้งคราว–สม่ำเสมอ |
| `editor` | ผู้เขียนเนื้อหา (อาจไม่ใช่นักกฎหมาย) | Markdown, ความรู้กฎหมายพื้นฐาน | รายวัน |
| `reviewer` | ผู้ตรวจเนื้อหา (Content Reviewer) — ก่อนเปิดใช้งานต้องเป็นนักกฎหมาย/ทนายความที่มีคุณสมบัติ | ความรู้กฎหมายระดับวิชาชีพ | รายวัน–รายสัปดาห์ |
| `org_owner` / `org_admin` | เจ้าของ/ผู้ดูแลองค์กรลูกค้า (ระดับองค์กร) | ผู้บริหาร SME / ผู้รับผิดชอบระบบ | รายสัปดาห์ |
| `org_member` | พนักงานขององค์กรที่ทำงานกับสัญญา (จัดซื้อ, ขาย, ผู้จัดการโครงการ) | ไม่มีความรู้กฎหมายเฉพาะ | รายวัน–รายสัปดาห์ |
| `org_counsel` | นิติกร/ทนายขององค์กร (ถ้ามี) | ความรู้กฎหมายระดับวิชาชีพ | รายวัน |
| `admin` | ผู้ดูแลระบบ/Ops | เทคนิค | รายวัน |

ผู้ใช้ในองค์กรส่วนใหญ่ไม่มีความรู้กฎหมายและต้องการคำตอบเชิงปฏิบัติที่เร็ว; ผู้ใช้บุคคลทั่วไปอาจเป็นผู้สูงอายุ ผู้มีการศึกษาไม่สูง หรืออยู่ในภาวะเครียด → UI ต้องเรียบง่าย ภาษาง่าย ตัวอักษรอ่านง่าย (NFR-USAB)

### 2.4 Operating Environment
- **Browser (client)**: 2 เวอร์ชันล่าสุดของ Chrome, Edge, Firefox, Safari (macOS); Mobile Safari (iOS 16+), Chrome Android (Android 10+)
- ความกว้างหน้าจอ 360px ขึ้นไป; รองรับ touch
- **Server**: Ubuntu 24.04 LTS, Docker Compose; Caddy (reverse proxy/TLS); Next.js standalone บน Node 22; Python 3.12; PostgreSQL 16 (pgvector, pg_trgm); Redis 7; MinIO; ClamAV
- **Environments** (ตรวจเครื่องปัจจุบัน 2026-09-24): **dev + staging** รันบน VM ปัจจุบัน (Ubuntu 24.04.5, 8 vCPU Xeon E5-2683 v4 ไม่มี GPU, RAM 31 GB ว่างจริง ~13 GB, disk ว่าง 129 GB, ใช้ร่วมกับระบบอื่น) ผ่าน Docker Compose ที่กำหนด `mem_limit` รวม ≈ 9 GB และใช้ port ที่ไม่ชนระบบอื่น; **production** ต้องเป็น VM แยก ขั้นต่ำ 8 vCPU / 32 GB RAM / SSD 200 GB (แนะนำ GPU ขนาดเล็กสำหรับ embedding) — รายละเอียดใน `03-technical-spec.md` §1
- **External**: SMTP (อีเมลยืนยัน/แจ้งเตือน), API ฐานความรู้ของบริษัท (ตัวเสริม ปิดเป็นค่าเริ่มต้น), แหล่งข้อมูลกฎหมายทางการ (ดาวน์โหลดโดย editor แล้วอัปโหลดผ่านหลังบ้าน)

### 2.5 Design & Implementation Constraints
- C1: UX/UI ต้องยึด pattern ของ AI-EDW (`03-technical-spec.md` §5) — layout 3 คอลัมน์, tokens, พฤติกรรมแชท
- C2: Frontend เป็น Next.js (App Router) + TypeScript strict, Tailwind CSS (component เขียนเอง) ที่ใช้ design tokens ชุดเดียวกับ AI-EDW (CSS variables); ไม่ deploy บน Vercel/cloud ต่างประเทศ (ใช้ Docker `output: 'standalone'` บน server ในประเทศไทย)
- C3: Web tier ห้ามเรียก API ภายนอกที่เกี่ยวกับการตอบคำถามตรง — ต้องผ่าน AI service (CLAUDE.md §2.3 ข้อ 10)
- C4: ห้ามแสดงตัวเลขทางกฎหมาย (ค่าธรรมเนียม, เกณฑ์ทุนทรัพย์, อายุความ, อัตราโทษ) ที่ไม่ได้มาจากเนื้อหาในคลังความรู้ที่มีแหล่งอ้างอิง (ฉบับที่ยังไม่ผ่านผู้ตรวจต้องติดป้ายฉบับร่าง)
- C5: ข้อมูลอยู่ใน data center ในประเทศไทย (ยกเว้นตัวเสริม API ฐานความรู้ของบริษัทเมื่อเปิดใช้ ซึ่งรับเฉพาะข้อความที่ mask PII แล้ว)
- C6: ข้อความ UI ทุกตัวต้องผ่านระบบแปล; รองรับ th/en ใน P1
- C7: การ publish เนื้อหาต้องผ่าน reviewer (four-eyes principle)

### 2.6 Assumptions & Dependencies
- A1: มีผู้ตรวจเนื้อหาที่เป็นนักกฎหมายอย่างน้อย 1 คนก่อนเริ่ม pilot P1 (Open Decision D5)
- A3: ตัวบทกฎหมาย/คำพิพากษาเป็นงานที่ไม่มีลิขสิทธิ์ตาม พ.ร.บ.ลิขสิทธิ์ พ.ศ. 2537 ม.7 (ต้องให้ที่ปรึกษากฎหมายยืนยัน) — แต่บทสรุป/บทความที่เขียนเองเป็นลิขสิทธิ์ของโครงการ
- A4: เนื้อหาเริ่มต้นของ P1 จำกัดที่กฎหมายสัญญา (ตัวบทตามชุดใน `docs/knowledge-base/`, บทความ, 5 คู่มือ, 5 แบบหนังสือ, 24 คำศัพท์) และเป็นฉบับร่างที่ยังไม่ผ่านผู้ตรวจจนกว่าจะมีการอนุมัติจริง; เนื้อหาหมวดอื่นเริ่มใน P2
- A5: CPU/GPU เพียงพอสำหรับ embedding (bge-m3) (ดู `03-technical-spec.md` §1 sizing) — บน VM ปัจจุบันซึ่งไม่มี GPU embedding รันบน CPU (retrieval = dense + lexical)
- A7: มีองค์กรนำร่อง 3–5 แห่งตกลงร่วม pilot ภายในปลาย พ.ย. 2569 และมีร่าง DPA ที่ที่ปรึกษากฎหมายตรวจแล้วก่อนเริ่ม pilot
- A8: สัญญาของ pilot ส่วนใหญ่เป็นไฟล์ที่มีข้อความ (text layer); ระบบไม่รองรับไฟล์สแกนเป็นภาพ
- A6: เว็บไซต์ตัวบททางการบางแห่งบล็อกการดึงอัตโนมัติ (ราชกิจจานุเบกษาและ law.go.th ตอบ 403; krisdika.go.th มีปัญหา TLS chain) → การนำเข้าตัวบทใน P1 ใช้การดาวน์โหลดไฟล์ทางการโดย editor แล้วอัปโหลดผ่านหลังบ้าน

---

## 3. Functional Requirements

### 3.1 FR-AUTH — M1 Account & Access

#### FR-AUTH-001 — สมัครสมาชิกด้วยอีเมล
- คำอธิบาย: ระบบต้องให้ผู้ใช้สมัครด้วยอีเมล + รหัสผ่าน + ชื่อที่แสดง และยืนยันอีเมลผ่านลิงก์ (อายุลิงก์ 24 ชม.)
- Role: guest · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given ผู้ใช้อยู่แท็บ "สมัครสมาชิก" ในหน้า `/login` หรือหน้า `/register` When กรอกอีเมลที่ยังไม่ถูกใช้ + รหัสผ่านตาม BR-016 + ติ๊กยอมรับข้อกำหนดและ consent บริการหลัก Then ระบบสร้างบัญชีสถานะ `pending_verification` และส่งอีเมลยืนยัน
  - AC2: Given อีเมลถูกใช้แล้ว When กดสมัคร Then แสดงข้อความกลาง ๆ "หากอีเมลนี้ยังไม่ได้ลงทะเบียน ระบบได้ส่งลิงก์ยืนยันไปแล้ว" (ไม่เปิดเผยว่ามีบัญชีอยู่)
  - AC3: Given ผู้ใช้คลิกลิงก์ยืนยันภายใน 24 ชม. When เปิดลิงก์ Then บัญชีเป็น `active` และเข้าสู่ระบบอัตโนมัติ; ถ้าเกิน 24 ชม. แสดงปุ่ม "ส่งลิงก์ใหม่"
- หมายเหตุ: ลิงก์ "ลืมรหัสผ่าน" ในหน้า login, หน้า `/forgot-password` และฟอร์มเชิญสมาชิกองค์กรแสดงเฉพาะเมื่อ `env.mailLive` เป็นจริง (`MAIL_LIVE=true` หรือ `SMTP_HOST` ไม่ใช่เครื่องนี้/mailpit); แถบเตือน "ยืนยันอีเมล" (ไม่ขึ้นกับ `mailLive`) แสดงเมื่อ `EMAIL_VERIFICATION_REQUIRED=true` และผู้ใช้ยังไม่ได้ยืนยันอีเมล; ถ้า `mailLive` ไม่จริง อีเมลที่ระบบส่งไปที่กล่องจดหมายทดสอบ (mailpit); สคริปต์ e2e ตั้ง `MAIL_LIVE=true`

#### FR-AUTH-002 — เข้าสู่ระบบ
- คำอธิบาย: ระบบต้องให้ผู้ใช้เข้าสู่ระบบด้วยอีเมล + รหัสผ่าน, มีปุ่มแสดง/ซ่อนรหัสผ่าน และตัวเลือกภาษา/ธีมบนหน้า login (ตาม AI-EDW)
- Role: guest · Priority: Must · Phase: P0
- Acceptance Criteria:
  - AC1: Given บัญชี `active` When กรอกข้อมูลถูกต้อง Then สร้าง session ใหม่ (Better Auth ออก session token ใหม่ใน cookie `lc.session_token`) และ redirect ไป `/chat` หรือ URL ที่ขอไว้ก่อน login
  - AC2: Given ข้อมูลผิด When กดเข้าสู่ระบบ Then แสดง "อีเมลหรือรหัสผ่านไม่ถูกต้อง" โดยไม่ระบุว่าผิดส่วนใด
  - AC3: Given บัญชี `pending_verification` When login Then แจ้งให้ยืนยันอีเมลพร้อมปุ่มส่งลิงก์ใหม่

#### FR-AUTH-003 — จดจำการเข้าสู่ระบบ (Remember me)
- คำอธิบาย: ระบบต้องมีตัวเลือก "จดจำฉัน" ที่คง session ได้ตาม BR-017
- Role: guest · Priority: Should · Phase: P1
- Acceptance Criteria:
  - AC1: Given ติ๊ก "จดจำฉัน" When ปิดเบราว์เซอร์แล้วเปิดใหม่ภายในระยะที่กำหนด Then ยังอยู่ในระบบ

#### FR-AUTH-004 — ลืมรหัสผ่าน
- คำอธิบาย: ระบบต้องให้ผู้ใช้ขอลิงก์ตั้งรหัสผ่านใหม่ทางอีเมล (ลิงก์ใช้ครั้งเดียว อายุ 1 ชม.) และยกเลิก session อื่นทั้งหมดหลังตั้งรหัสใหม่
- Role: guest · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given ผู้ใช้กรอกอีเมลใด ๆ When กดส่ง Then แสดงข้อความเดียวกันเสมอ (ไม่เปิดเผยการมีอยู่ของบัญชี)
  - AC2: Given ลิงก์ถูกใช้แล้วหรือหมดอายุ When เปิดลิงก์ Then แสดงว่าลิงก์ใช้ไม่ได้
  - AC3: Given ตั้งรหัสใหม่สำเร็จ When มี session อื่นเปิดอยู่ Then session เหล่านั้นถูกยกเลิกและบันทึก audit log
- หมายเหตุ: ลิงก์ "ลืมรหัสผ่าน" ในหน้า login, หน้า `/forgot-password` และฟอร์มเชิญสมาชิกองค์กรแสดงเฉพาะเมื่อ `env.mailLive` เป็นจริง (`MAIL_LIVE=true` หรือ `SMTP_HOST` ไม่ใช่เครื่องนี้/mailpit); แถบเตือน "ยืนยันอีเมล" (ไม่ขึ้นกับ `mailLive`) แสดงเมื่อ `EMAIL_VERIFICATION_REQUIRED=true` และผู้ใช้ยังไม่ได้ยืนยันอีเมล; ถ้า `mailLive` ไม่จริง อีเมลที่ระบบส่งไปที่กล่องจดหมายทดสอบ (mailpit); สคริปต์ e2e ตั้ง `MAIL_LIVE=true`

#### FR-AUTH-005 — ออกจากระบบ
- คำอธิบาย: ระบบต้องให้ออกจากระบบจาก user menu โดยทำลาย session ฝั่ง server และล้าง cookie
- Role: member+ · Priority: Must · Phase: P0
- Acceptance Criteria:
  - AC1: Given ผู้ใช้กด "ออกจากระบบ" When redirect ไป `/login` Then การเรียก API ด้วย session เดิมได้ HTTP 401

#### FR-AUTH-006 — โหมด Guest
- คำอธิบาย: ระบบต้องให้ผู้ใช้เริ่มใช้งานแชทและอ่านเนื้อหาได้โดยไม่สมัคร ผ่านปุ่ม "ทดลองใช้โดยไม่สมัคร" (สร้าง guest identity ด้วย Better Auth `anonymous` plugin เป็นแถว `app.users` ที่ `is_anonymous = true` และใช้ cookie session ปกติ)
- Role: guest · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given ผู้ใช้กด "ทดลองใช้โดยไม่สมัคร" และยอมรับ consent บริการหลัก When เข้าสู่ `/chat` Then แชทได้ และ sidebar แสดงแชทของ guest นั้น
  - AC2: Given guest When เปิดเมนูที่ต้องเป็นสมาชิก (ที่บันทึกไว้, แชร์แชท, โฟลเดอร์แชท, องค์กร) Then แสดง prompt ชวนสมัคร/เข้าสู่ระบบ
  - AC3: Given guest ไม่ได้ใช้งานเกินระยะใน BR-003 Then ข้อมูลแชทของ guest ถูกลบโดย job
- หมายเหตุ (สิ่งที่เห็นบนหน้าจอ): ชื่อผู้ใช้ของ guest คือ "ผู้ทดลองใช้" และข้อความต้อนรับไม่มีชื่อ; ปุ่ม "ทดลองใช้โดยไม่สมัคร (ถามได้ 10 ข้อความต่อวัน)" อยู่ในหน้าเข้าสู่ระบบและหน้าสมัครสมาชิก; แถบซ้ายมีลิงก์ "สมัครสมาชิกเพื่อบันทึกประวัติ"; "ที่บันทึกไว้" แสดง "ผู้ใช้ทดลองบันทึกคำตอบไม่ได้ สมัครสมาชิกเพื่อเก็บคำตอบและบทความไว้ดูภายหลัง" พร้อมปุ่ม "สมัครสมาชิก"; "ตั้งค่าบัญชี" มีเฉพาะการ์ด "การแสดงผล" (ภาษา ธีม ขนาดตัวอักษร เก็บในเบราว์เซอร์นี้) กับข้อความชวนสมัครสมาชิก; ตัวสลับพื้นที่ทำงานแสดง "สมัครสมาชิกก่อนเพื่อสร้างพื้นที่ทำงานองค์กร" และเมนู "องค์กร" ไม่ปรากฏ

#### FR-AUTH-007 — Quota ของ Guest และแบนเนอร์แจ้งเตือน
- คำอธิบาย: ระบบต้องจำกัดจำนวนข้อความต่อวันตาม role (BR-001) และแสดงจำนวนที่เหลือเมื่อเหลือ ≤ 3 ข้อความ
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given guest ใช้ครบ quota When ส่งข้อความ Then ได้ SSE event `guardrail` (`kind=quota`, `stage=quota`) และ bubble แจ้ง "ใช้ครบโควตาวันนี้แล้ว" พร้อมปุ่มสมัครสมาชิก
  - AC2: Given เหลือ 3 ข้อความ When ส่งข้อความ Then แสดงแบนเนอร์เหนือช่องพิมพ์ "เหลือ 3 ข้อความสำหรับวันนี้"
  - AC3: Given เวลา 00:00 Asia/Bangkok When เริ่มวันใหม่ Then quota รีเซ็ต

#### FR-AUTH-008 — ย้ายแชท Guest เข้าบัญชี
- คำอธิบาย: ระบบต้องย้ายแชทของ guest เข้าบัญชีโดยอัตโนมัติเมื่อ guest สมัครสมาชิกหรือเข้าสู่ระบบในเบราว์เซอร์เดียวกัน (`claim_guest_data`)
- Role: guest → member · Priority: Should · Phase: P1
- Acceptance Criteria:
  - AC1: Given guest มีแชท ≥1 When สมัคร/login สำเร็จ Then แชทเปลี่ยน owner เป็น user และ guest identity ถูกปิด

#### FR-AUTH-009 — PDPA Consent แยกวัตถุประสงค์
- คำอธิบาย: ระบบต้องขอ consent แยกตามวัตถุประสงค์ (enum `app.consent_purpose`): (1) `service_terms` ข้อตกลงการใช้บริการ (จำเป็น) + `privacy_notice` รับทราบประกาศความเป็นส่วนตัว (จำเป็น) (2) `improve_service` ใช้ข้อมูลแบบไม่ระบุตัวตนเพื่อปรับปรุงระบบ (opt-in) (3) `marketing` (opt-in) พร้อมลิงก์ประกาศความเป็นส่วนตัวเวอร์ชันปัจจุบัน
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given ผู้ใช้ใหม่ When สมัคร/เริ่ม guest Then ต้องยอมรับ `service_terms` + `privacy_notice` ก่อนใช้งาน; `improve_service` ไม่ติ๊กไว้ล่วงหน้า
  - AC2: Given consent ถูกให้หรือถอน When บันทึก Then เก็บ record ใน `app.user_consents` พร้อม purpose, version ประกาศ, timestamp, IP hash
  - AC3: Given ประกาศความเป็นส่วนตัวมีเวอร์ชันใหม่ที่ต้องขอ consent ใหม่ When ผู้ใช้เข้าระบบครั้งถัดไป Then แสดง dialog ขอ consent ใหม่

#### FR-AUTH-010 — ถอน Consent
- คำอธิบาย: ระบบต้องให้ผู้ใช้ดูและถอน consent ได้จากเมนู "ความเป็นส่วนตัว & ข้อมูลของฉัน"
- Role: member+ · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given ผู้ใช้ถอน consent ที่ไม่บังคับ (`improve_service`, `marketing`) When ยืนยัน Then มีผลทันที และบันทึก record ถอนใน `app.user_consents`
  - AC2: Given ผู้ใช้ถอน `service_terms` Then ระบบแจ้งว่าต้องลบบัญชี และนำไปขั้นตอน FR-AUTH-018

#### FR-AUTH-011 — โปรไฟล์
- คำอธิบาย: ระบบต้องให้แก้ชื่อที่แสดงจากหน้าตั้งค่าบัญชี (`/settings`)
- Role: member+ · Priority: Should · Phase: P1
- Acceptance Criteria:
  - AC1: Given แก้ชื่อแล้วบันทึก Then ชื่อใน header และเมนูผู้ใช้อัปเดต

#### FR-AUTH-012 — เปลี่ยนรหัสผ่าน
- คำอธิบาย: ระบบต้องให้เปลี่ยนรหัสผ่านโดยกรอกรหัสปัจจุบัน + รหัสใหม่ 2 ครั้ง
- Role: member+ · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given รหัสปัจจุบันผิด Then ไม่เปลี่ยนและนับเป็นความพยายามล้มเหลว (FR-AUTH-019)
  - AC2: Given สำเร็จ Then session อื่นทั้งหมดถูกยกเลิก และส่งอีเมลแจ้งเตือนการเปลี่ยนรหัส

#### FR-AUTH-013 — เลือกภาษา
- คำอธิบาย: ระบบต้องให้เลือกภาษา UI (ไทย, English) จากปุ่มภาษาใน header และหน้า login; บันทึกใน profile (member) หรือ localStorage (guest)
- Role: all · Priority: Must · Phase: P0
- Acceptance Criteria:
  - AC1: Given เลือก English When หน้า reload Then ข้อความ UI ทั้งหมดเป็นภาษาอังกฤษ และ `<html lang="en">`
  - AC2: Given ภาษา UI = English Then ข้อความของระบบในคำตอบ (คำนำ บรรทัดปิดท้าย) เป็นภาษาอังกฤษ และเนื้อหาจากคลังเป็นภาษาไทย (FR-AI-018)

#### FR-AUTH-014 — ธีม Light/Dark
- คำอธิบาย: ระบบต้องมี toggle ธีม, ใช้ค่าจาก `prefers-color-scheme` เมื่อยังไม่เคยเลือก, ใช้ธีมก่อน first paint (ไม่กระพริบ) และจำใน localStorage key `lc_theme`
- Role: all · Priority: Must · Phase: P0
- Acceptance Criteria:
  - AC1: Given เลือก dark When เปิดหน้าใดก็ตาม Then ไม่มีการกระพริบเป็นสีขาวก่อน render
  - AC2: ทุก component ผ่าน contrast ตาม NFR-A11Y-002 ทั้ง 2 ธีม

#### FR-AUTH-016 — Session Countdown และหมดอายุ
- คำอธิบาย: ระบบต้องแสดงเวลาที่เหลือของ session ที่ footer (ตาม AI-EDW), เตือนเมื่อเหลือ 5 นาที พร้อมปุ่ม "ต่อเวลา" แล้วออกจากระบบอัตโนมัติเมื่อหมดเวลา และเรียก `check_session` เป็นระยะ
- Role: member+ · Priority: Should · Phase: P1
- Acceptance Criteria:
  - AC1: Given เหลือ 5 นาที Then แสดง toast พร้อมปุ่ม "ต่อเวลา"; กดแล้ว countdown รีเซ็ต
  - AC2: Given session หมดอายุ When ผู้ใช้กดส่งข้อความ Then ข้อความที่พิมพ์ถูกเก็บเป็น draft ใน `sessionStorage` (ต่อแท็บ — ไม่ใช้ localStorage เพื่อไม่ให้ข้อความคดีค้างในเครื่องที่ใช้ร่วมกัน) และ redirect ไป login; กลับมาแล้วข้อความยังอยู่ (ล้างเมื่อกดออกจากระบบ)

#### FR-AUTH-017 — ส่งออกข้อมูลของฉัน
- คำอธิบาย: ระบบต้องให้ผู้ใช้ดาวน์โหลดข้อมูลส่วนบุคคลของตนเป็นไฟล์ JSON ทันทีจากหน้าตั้งค่า (โปรไฟล์, ตั้งค่า, consent, แชท, feedback)
- Role: member+ · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given ผู้ใช้กด "ดาวน์โหลดข้อมูลของฉัน" Then ได้ไฟล์ JSON ของบัญชีนั้น และมีรายการใน `app.dsr_requests`
  - AC2: ต้อง login ด้วยบัญชีเดียวกันจึงดาวน์โหลดได้

#### FR-AUTH-018 — ลบบัญชี
- คำอธิบาย: ระบบต้องให้ลบบัญชีด้วยการยืนยันรหัสผ่าน โดยบัญชีเข้าสู่สถานะ `pending_deletion` ตาม BR-012 และยกเลิกได้ในช่วงผ่อนผัน
- Role: member · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given ยืนยันลบ Then logout ทันที, ลิงก์แชร์ทั้งหมดถูก revoke, ส่งอีเมลยืนยันพร้อมลิงก์ยกเลิก
  - AC2: Given พ้นช่วงผ่อนผัน Then job ลบข้อมูลส่วนบุคคลแบบถาวร และ audit log เก็บเฉพาะ user id แบบ pseudonymized

#### FR-AUTH-019 — ป้องกันการเดารหัสผ่าน
- คำอธิบาย: ระบบต้องจำกัดความพยายาม login ล้มเหลวต่อบัญชีและต่อ IP ตาม BR-016
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given ล้มเหลว 5 ครั้งใน 15 นาที Then ล็อก 15 นาที และแจ้งเจ้าของบัญชีทางอีเมล
  - AC2: ทุกเหตุการณ์ login (สำเร็จ/ล้มเหลว/ล็อก) ถูกบันทึกใน `app.audit_log`

#### FR-AUTH-021 — ตรวจเวอร์ชันแอป (Build check)
- คำอธิบาย: ทุก JSON response ต้องมีฟิลด์ `build`; เมื่อ client พบ build ต่างจากที่โหลดไว้ ต้องแสดงแถบ "มีเวอร์ชันใหม่ — รีเฟรช" (ตาม AI-EDW)
- Role: all · Priority: Should · Phase: P0
- Acceptance Criteria:
  - AC1: Given deploy build ใหม่ When client เรียก API ครั้งถัดไป Then แสดงแถบแจ้งเตือน (ไม่ reload เองขณะกำลัง stream)

#### FR-AUTH-022 — Role-based Access Control
- คำอธิบาย: ระบบต้องบังคับสิทธิ์ตาม role (`guest`, `member`, `editor`, `reviewer`, `admin`) ที่ฝั่ง server ทุก action และตรวจ ownership ของ resource; role ที่ได้จากสคริปต์ `scripts/set-role.sh` หรือหน้า "ผู้ใช้" ของหลังบ้าน
- Role: all · Priority: Must · Phase: P0
- Acceptance Criteria:
  - AC1: Given member เรียก `admin_*` action Then ได้ HTTP 403 และบันทึก audit log
  - AC2: Given user A ขอ `get_chat` ของ user B Then ได้ HTTP 404 (ไม่เปิดเผยการมีอยู่)
  - AC3: ผู้ใช้ 1 คนมี role ระบบได้ 1 role (enum `app.user_role`); ผู้ที่ส่งเนื้อหาเข้าตรวจล่าสุดอนุมัติเนื้อหานั้นเองไม่ได้ (BR-007)

#### FR-AUTH-023 — ขนาดตัวอักษร (Text Scale)
- คำอธิบาย: ระบบต้องให้ผู้ใช้เลือกขนาดตัวอักษรของเนื้อหา (`app.user_settings.text_scale`: 100% / 112% / 125% / 150% ตาม CHECK ใน DB) จากหน้าตั้งค่า เพื่อรองรับผู้สูงอายุ; guest เก็บในเบราว์เซอร์ (cookie `lc_scale`)
- Role: all · Priority: Should · Phase: P1
- Acceptance Criteria:
  - AC1: Given เลือก 125% Then ข้อความแชท บทความ และคู่มือขยายทันทีโดย layout ไม่แตก (สอดคล้อง NFR-A11Y-006) และค่าคงอยู่หลัง reload/login ใหม่
  - AC2: บันทึกผ่าน `update_settings` (member) และมีผลกับทุกอุปกรณ์ของบัญชีนั้น

#### FR-AUTH-024 — ติดตามคำขอใช้สิทธิเจ้าของข้อมูล (DSR)
- คำอธิบาย: ทุกคำขอตามสิทธิ PDPA (เข้าถึง/ขอสำเนา, แก้ไข, ลบ, คัดค้าน, ถอน consent) ต้องสร้างรายการใน `app.dsr_requests` (`request_type`: `access`, `export`, `rectify`, `erase`, `object`, `withdraw_consent`) พร้อม `due_at` = วันรับคำขอ + 30 วัน และผู้ใช้เห็นสถานะคำขอของตนในหน้า "ความเป็นส่วนตัว & ข้อมูลของฉัน"
- Role: member · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given ผู้ใช้ใช้ `privacy_export` Then มีแถวใน `app.dsr_requests` ประเภท `export` สถานะ `completed` ทันที; Given ใช้ `request_account_deletion` Then มีแถวประเภท `erase` สถานะ `in_progress` และได้อีเมลยืนยันพร้อมลิงก์ยกเลิก
  - AC2: สถานะเปลี่ยนตามลำดับ `received → in_progress → completed | rejected`; การปฏิเสธต้องมีเหตุผลที่แจ้งผู้ใช้
  - AC3: คำขอที่ใกล้ครบ `due_at` (≤ 7 วัน) ถูกแจ้งเตือนผู้ดูแล (FR-ADM-023) — SLA 30 วันตาม NFR-PRIV-006

#### FR-AUTH-025 — ยืนยันตัวตนสองชั้นสำหรับเจ้าหน้าที่ (TOTP 2FA)
- คำอธิบาย: บัญชีที่มี role `editor`, `reviewer` หรือ `admin` ต้องลงทะเบียน TOTP (Better Auth `twoFactor` plugin; secret เก็บแบบเข้ารหัสใน `app.two_factors`) และยืนยันรหัส 6 หลักทุกครั้งที่ login; มี recovery codes แบบใช้ครั้งเดียว
- Role: editor, reviewer, admin · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given ผู้ใช้ได้รับ role staff ครั้งแรก When login Then ถูกบังคับเข้าหน้าตั้งค่า TOTP ก่อนเข้า `/admin`
  - AC2: Given ใส่รหัส TOTP ผิด 5 ครั้ง Then ล็อกชั่วคราวตาม FR-AUTH-019 และบันทึก `app.audit_log`
  - AC3: สอดคล้อง NFR-SEC-006; "จดจำฉัน" ใช้ไม่ได้กับ role staff (BR-017)

---

### 3.2 FR-CHAT — M2 แชทถามกฎหมาย (UI และพฤติกรรมแชท)

#### FR-CHAT-001 — เริ่มแชทใหม่และ Empty State
- คำอธิบาย: ระบบต้องมีปุ่ม "แชทใหม่" ใน sidebar; หน้าแชทว่างต้องแสดงคำทักทาย, disclaimer สั้น และการ์ดตัวอย่างคำถาม 4 ใบที่ตรงกับเรื่องที่คลังความรู้ครอบคลุม (ค่าปรับส่งงานล่าช้า, ของไม่ได้มาตรฐาน, การเลิกสัญญา, ตรวจข้อสัญญา)
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given ผู้ใช้กด "แชทใหม่" Then พื้นที่แชทว่าง, URL ไม่มี `?chat=`, ช่องพิมพ์ได้ focus
  - AC2: Given กดการ์ดตัวอย่าง Then ข้อความของการ์ดถูกส่งเป็นคำถามทันที
  - AC3: แชทใหม่ยังไม่ถูกสร้างใน DB จนกว่าจะส่งข้อความแรก (server ส่ง event `chat_id`)

#### FR-CHAT-002 — ส่งข้อความ
- คำอธิบาย: ระบบต้องมีช่องพิมพ์แบบ auto-grow (ขยายตามข้อความจนถึงความสูงสูงสุดแล้ว scroll), Enter = ส่ง, Shift+Enter = ขึ้นบรรทัดใหม่, ตัวนับอักษรเมื่อใกล้ถึง BR-002
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given ข้อความว่างหรือมีแต่ช่องว่าง Then ปุ่มส่ง disabled
  - AC2: Given ข้อความเกิน BR-002 Then ส่งไม่ได้และแสดงจำนวนอักษรเกิน
  - AC3: Given ส่งแล้ว Then bubble ผู้ใช้ปรากฏทันที และ bubble ผู้ช่วยแสดงสถานะ "กำลังวิเคราะห์คำถาม…"
  - AC4: ระหว่างกำลัง stream ในแชทเดียวกัน ปุ่มส่งเปลี่ยนเป็นปุ่ม "หยุด" (FR-CHAT-005)

#### FR-CHAT-003 — แสดงคำตอบแบบ Streaming
- คำอธิบาย: ระบบต้องแสดงคำตอบทีละส่วนจาก SSE event `chunk` พร้อม fade-in เฉพาะส่วนที่เพิ่มใหม่ และ render markdown แบบปลอดภัยระหว่าง stream
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given คำตอบกำลัง stream When ผู้ใช้ไม่ได้เลื่อนขึ้น Then หน้าจอเลื่อนตามอัตโนมัติ; When ผู้ใช้เลื่อนขึ้น Then หยุดเลื่อนตามและแสดงปุ่ม scroll-to-bottom
  - AC2: Given เครือข่ายขาดกลางคัน Then bubble แสดงข้อความ error ที่อ่านเข้าใจ + ปุ่ม "ลองใหม่" และเก็บส่วนที่ได้รับแล้ว
  - AC3: TTFT เป็นไปตาม NFR-PERF-001

#### FR-CHAT-004 — แสดงสถานะขั้นตอนการทำงาน
- คำอธิบาย: ระบบต้องแสดงข้อความสถานะจาก event `status` ใน header ของ bubble ผู้ช่วย (กระพริบเบา ๆ) เช่น "กำลังวิเคราะห์คำถาม", "กำลังค้นตัวบทกฎหมาย", "กำลังตรวจสอบการอ้างอิง" และล้างเมื่อ `complete`
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given ได้ event `status` Then ข้อความสถานะแทนที่ข้อความก่อนหน้า (ไม่ต่อท้ายในเนื้อหา)
  - AC2: Given `prefers-reduced-motion` Then ไม่มีการกระพริบ

#### FR-CHAT-005 — หยุดการสร้างคำตอบ
- คำอธิบาย: ระบบต้องให้กด "หยุด" เพื่อยกเลิก stream (AbortController) และ server ต้องหยุดประมวลผลคำตอบนั้นด้วย
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given กดหยุด Then ส่วนที่ได้รับแล้วถูกเก็บพร้อมข้อความ "หยุดการสร้างคำตอบแล้ว" และมีปุ่มสร้างใหม่
  - AC2: ข้อความที่ถูกหยุดนับ quota ตามจริง (นับเมื่อเริ่มส่ง)

#### FR-CHAT-006 — สร้างคำตอบใหม่ (Regenerate)
- คำอธิบาย: ระบบต้องมีปุ่ม regenerate ที่คำตอบล่าสุดเท่านั้น ส่ง `regenerate: 1` เพื่อแทนที่คำตอบล่าสุด; เก็บเวอร์ชันก่อนหน้าให้สลับดูได้ (‹ 1/2 ›)
- Role: all · Priority: Should · Phase: P1
- Acceptance Criteria:
  - AC1: Given กด regenerate Then คำตอบใหม่แทนที่ในตำแหน่งเดิม และมีตัวสลับเวอร์ชัน
  - AC2: regenerate นับ quota 1 ข้อความ

#### FR-CHAT-007 — คัดลอกข้อความ
- คำอธิบาย: ระบบต้องมีปุ่มคัดลอกที่คำตอบของผู้ช่วย (คัดลอกข้อความของคำตอบเป็นข้อความธรรมดา)
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given กดคัดลอก Then ไอคอนเปลี่ยนเป็นสถานะ "คัดลอกแล้ว" 1.5 วินาที และ clipboard มีข้อความของคำตอบ

#### FR-CHAT-008 — Render Markdown อย่างปลอดภัย
- คำอธิบาย: ระบบต้อง render markdown (หัวข้อ, list, ตาราง, ตัวหนา, blockquote, ลิงก์) ด้วย react-markdown + remark-gfm + rehype-sanitize (allow-list; ห้าม `dangerouslySetInnerHTML` กับข้อความดิบ); ลิงก์ภายนอกเปิดแท็บใหม่ `rel="noopener noreferrer"`; ตารางกว้างเลื่อนแนวนอนได้ และมีปุ่มคัดลอกตาราง
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given ข้อความมี `<script>` หรือ `onerror=` Then ไม่ถูก execute (ทดสอบด้วย XSS payload list)
  - AC2: Given ข้อความมี error Then แสดงเป็น textContent

#### FR-CHAT-009 — Citation Chips
- คำอธิบาย: ระบบต้องแสดง citation แบบตัวยก `[1]` ในเนื้อหา และแถบ chips ท้ายคำตอบ เช่น `[1] ป.พ.พ. ม.420`, `[2] บทความ: ผิดสัญญาเช่า` จาก event `citations` (chip แสดงเลขลำดับและชื่อแหล่ง)
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given click chip หรือ `[n]` Then เปิด Source Drawer (FR-CHAT-010) ที่รายการนั้น
  - AC2: Given คำตอบไม่มี citation (เช่น คำทักทาย) Then ไม่แสดงแถบ chips

#### FR-CHAT-010 — Source Drawer (แผง "แหล่งอ้างอิง")
- คำอธิบาย: ระบบต้องแสดงรายการแหล่งอ้างอิงของคำตอบที่เลือก; แต่ละรายการแสดงชนิดแหล่ง, ชื่อกฎหมาย/บทความ/เลขมาตรา, ข้อความของแหล่งนั้น (ตัวบทแสดงตามวรรค), วันที่ของข้อมูล (as-of), วันมีผล (ถ้ามี), ปุ่ม "เปิดดูฉบับเต็ม" ไปหน้า `/law/...` / `/library/...` และลิงก์แหล่งต้นฉบับทางการ (ถ้ามี) — ข้อมูลมากับ event `citations` ไม่ต้องเรียก endpoint เพิ่ม
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given เปิด drawer บนมือถือ Then แสดงเป็น bottom sheet ปิดด้วยปุ่มปิดหรือกด Esc (บนเดสก์ท็อปเป็นแผงด้านขวา)
  - AC2: Given เปิดจาก chip หรือ `[n]` Then เลื่อนไปที่รายการนั้นและเน้นกรอบ

#### FR-CHAT-011 — ขอบเขตกฎหมาย (Legal Scope Selector)
- คำอธิบาย: ระบบต้องมีแผง "ขอบเขตกฎหมาย" เหนือช่องพิมพ์ แสดง **เฉพาะหมวดที่มีเนื้อหาในคลังความรู้** (checkbox) + ตัวเลือก "อัตโนมัติ" (ค่าเริ่มต้น) + "เลือกทั้งหมด" + พับ/ขยายได้; ค่าที่เลือกผูกกับแชทนั้น (หน้าจอแสดงชิป "ขอบเขตกฎหมาย: อัตโนมัติ" เมื่อกดเปิดแผงจะมีข้อความ "ถ้าเลือก คำตอบจะค้นเฉพาะหมวดที่เลือก" และช่องติ๊ก 3 หมวด: "บุคคลและนิติกรรม", "หนี้และสัญญา", "กระบวนการยุติธรรมและวิธีพิจารณาความ" — ยังไม่มี "คุ้มครองผู้บริโภค" ในรายการนี้ทั้งที่หน้า "คลังความรู้" มี 4 หมวด)
- Role: all · Priority: Should · Phase: P1
- Acceptance Criteria:
  - AC1: Given เลือก "อัตโนมัติ" Then request ส่ง `scope: "auto"` และระบบจัดหมวดเอง
  - AC2: Given เลือกหมวดที่มีเนื้อหา (เช่น `CONTRACT`) Then request ส่ง `scope: ["CONTRACT"]` และการ retrieve จำกัดเฉพาะหมวดนั้น (ตรวจจาก log citations)
  - AC3: Given เปลี่ยนแชท Then แผงแสดง scope ของแชทนั้น

#### FR-CHAT-013 — คำถามต่อเนื่องแนะนำ (Follow-up Suggestions)
- คำอธิบาย: ระบบต้องแสดงคำถามต่อเนื่องแนะนำไม่เกิน 3 ข้อใต้คำตอบล่าสุด (ฟิลด์ `followups` ของ event `suggestions`)
- Role: all · Priority: Should · Phase: P1
- Acceptance Criteria:
  - AC1: Given คำตอบเสร็จ Then แสดง suggestion 0–3 รายการ กดแล้วส่งเป็นคำถาม
  - AC2: suggestion แสดงเฉพาะที่คำตอบล่าสุดเท่านั้น

#### FR-CHAT-014 — การ์ด "ขั้นตอนถัดไป" (Next-step Cards)
- คำอธิบาย: ระบบต้องแสดงการ์ดลิงก์ไปยังคู่มือ (M5), แบบหนังสือ (M6) หรือบทความ (M3) ที่เกี่ยวข้อง จากฟิลด์ `next_steps[]` (`type`: `guide`, `template`, `article`) ของ event `suggestions` โดยอ้างอิงเฉพาะเนื้อหาที่มีอยู่ในคลัง
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given คำตอบเรื่องบอกเลิกสัญญา Then อาจแสดงการ์ดคู่มือหรือแบบหนังสือที่เกี่ยวข้องซึ่งลิงก์ไปหน้าจริง
  - AC2: การ์ดที่ลิงก์ไปเนื้อหาที่ไม่มีอยู่/ไม่ published ต้องไม่ถูกแสดง (ตรวจฝั่ง AI service)

#### FR-CHAT-015 — Glossary Tooltip
- คำอธิบาย: ระบบต้อง highlight ศัพท์กฎหมายในคำตอบที่มีใน `kb.glossary_terms` (เฉพาะครั้งแรกที่พบในแต่ละคำตอบ) และแสดงคำอธิบายสั้นเมื่อ hover/tap พร้อมลิงก์ไปหน้าอภิธานศัพท์
- Role: all · Priority: Should · Phase: P1
- Acceptance Criteria:
  - AC1: Given คำตอบมีคำว่า "นิติกรรม" Then คำนั้นมีเส้นใต้ประ และ tooltip แสดงคำอธิบาย
  - AC2: tooltip เข้าถึงได้ด้วยคีย์บอร์ด (focusable, `aria-describedby`)
  - AC3: highlight ทำหลัง stream จบ (ไม่ทำระหว่าง stream)

#### FR-CHAT-016 — Feedback 👍/👎 พร้อมเหตุผล
- คำอธิบาย: ระบบต้องมีปุ่ม 👍/👎 ที่ทุกคำตอบ; 👎 เปิด popover ให้เลือกเหตุผลตาม BR-014 (เลือกได้หลายข้อ) + ช่องความเห็น (≤1,000 อักษร) และ checkbox "อนุญาตให้ทีมกฎหมายดูบทสนทนานี้เพื่อปรับปรุง"
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given กด 👍 Then บันทึกทันที ปุ่มเปลี่ยนสถานะ; กดซ้ำ = ยกเลิก
  - AC2: Given ส่ง 👎 พร้อมอนุญาต Then รายการเข้า feedback queue ของ reviewer (FR-ADM-011) พร้อมบทสนทนา; ถ้าไม่อนุญาต reviewer เห็นเฉพาะเหตุผลและ metadata
  - AC3: บันทึกใน `app.message_feedback` พร้อมเหตุผลและความเห็น

#### FR-CHAT-017 — บันทึกคำตอบ (Bookmark)
- คำอธิบาย: ระบบต้องให้บันทึกคำตอบลงหน้า "ที่บันทึกไว้" (FR-CHAT-034)
- Role: member+ · Priority: Should · Phase: P1
- Acceptance Criteria:
  - AC1: Given กดบันทึก Then รายการปรากฏในหน้า "ที่บันทึกไว้" และไอคอนเปลี่ยนเป็น "บันทึกแล้ว"
  - AC2: Given guest กดบันทึก Then แสดง prompt ชวนสมัคร

#### FR-CHAT-018 — ประวัติแชท (แชทล่าสุด)
- คำอธิบาย: ระบบต้องแสดงรายการแชทใน sidebar เรียง: ปักหมุด → ตามลำดับที่ผู้ใช้จัด/อัปเดตล่าสุด; แสดงชื่อแชทและป้ายสถานะ (กำลังตอบ / มีคำตอบใหม่ / แชร์อยู่)
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given คลิกรายการ Then โหลดแชทนั้นโดยไม่ reload หน้า และ URL เป็น `/chat/<chatId>`
  - AC2: Given แชท > 50 รายการ Then โหลดเพิ่มเมื่อเลื่อนถึงท้าย (pagination)
  - AC3: แสดง loading overlay ระหว่างโหลด (ตาม AI-EDW)

#### FR-CHAT-019 — กรองแชท
- คำอธิบาย: ระบบต้องมีช่อง "กรองแชท…" ที่กรองตามชื่อแชทแบบ real-time (client-side สำหรับรายการที่โหลดแล้ว + server-side ค้นชื่อเมื่อพิมพ์ ≥2 ตัว)
- Role: all · Priority: Should · Phase: P1
- Acceptance Criteria:
  - AC1: Given พิมพ์ "ที่ดิน" Then แสดงเฉพาะแชทที่ชื่อมีคำนี้ รวมในโฟลเดอร์ (โฟลเดอร์ขยายอัตโนมัติ)
  - AC2: Given ไม่พบ Then แสดง "ไม่พบแชทที่ตรงกัน"

#### FR-CHAT-020 — ตั้งชื่อ/เปลี่ยนชื่อแชท
- คำอธิบาย: ระบบต้องตั้งชื่อแชทอัตโนมัติหลังคำตอบแรก (event `title_update`, FR-AI-014) และให้ผู้ใช้เปลี่ยนชื่อแบบ inline จากเมนู ⋮ (Enter = บันทึก, Esc = ยกเลิก)
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given แชทใหม่ได้คำตอบแรก Then ชื่อใน sidebar เปลี่ยนจาก "แชทใหม่" เป็นชื่อที่ระบบตั้ง ≤ 60 อักษร
  - AC2: Given ผู้ใช้เปลี่ยนชื่อเอง Then ระบบไม่ตั้งชื่อทับอีก (BR-013)
  - AC3: ชื่อว่างไม่ถูกบันทึก (คืนค่าเดิม)

#### FR-CHAT-021 — ปักหมุดแชท
- คำอธิบาย: ระบบต้องให้ปักหมุด/ยกเลิกปักหมุดจากเมนู ⋮; แชทที่ปักหมุดอยู่บนสุดพร้อมไอคอนหมุดและเส้นแบ่ง
- Role: all · Priority: Should · Phase: P1
- Acceptance Criteria:
  - AC1: Given ปักหมุด Then แชทย้ายไปกลุ่มบนสุดทันที; ยกเลิกแล้วกลับตำแหน่งตามเวลา

#### FR-CHAT-022 — ลบแชท
- คำอธิบาย: ระบบต้องให้ลบแชทผ่าน confirm dialog; การลบเป็น soft-delete และลิงก์แชร์ของแชทนั้นถูก revoke
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given ยืนยันลบแชทที่กำลังเปิดอยู่ Then กลับไปหน้าแชทใหม่
  - AC2: Given ลบแชทที่กำลัง stream Then stream ถูกยกเลิกก่อน
  - AC3: ข้อมูลที่ soft-delete ถูกลบถาวรภายใน 30 วัน (job)

#### FR-CHAT-023 — โฟลเดอร์แชท
- คำอธิบาย: ระบบต้องให้สร้าง (ปุ่ม + ข้าง "แชทล่าสุด"), เปลี่ยนชื่อ, ลบ (เลือก: ลบเฉพาะโฟลเดอร์และย้ายแชทออก / ลบพร้อมแชท), พับ/ขยาย (จำสถานะ) และแสดงจำนวนแชทในโฟลเดอร์
- Role: member+ · Priority: Should · Phase: P1
- Acceptance Criteria:
  - AC1: Given สร้างโฟลเดอร์ Then แสดง input ชื่อแบบ inline, ชื่อซ้ำได้แต่ไม่ว่าง
  - AC2: Given ลบโฟลเดอร์แบบไม่ลบแชท Then แชทย้ายไปรายการหลัก
  - AC3: Given reload Then สถานะพับ/ขยายยังคงเดิม

#### FR-CHAT-025 — สถานะแชทหลายรายการพร้อมกัน (State Dot)
- คำอธิบาย: ระบบต้องให้สลับไปแชทอื่นระหว่างที่อีกแชทกำลัง stream; sidebar แสดงจุดสถานะ `processing` (กำลังตอบ) และ `reply-ready` (มีคำตอบใหม่ยังไม่ได้ดู)
- Role: all · Priority: Should · Phase: P1
- Acceptance Criteria:
  - AC1: Given แชท A กำลัง stream When เปิดแชท B Then stream A ทำงานต่อ และจุดสถานะของ A เป็น processing
  - AC2: Given A ตอบเสร็จขณะดู B Then จุดของ A เปลี่ยนเป็น reply-ready; เปิด A แล้วจุดหาย
  - AC3: จำกัด stream พร้อมกันต่อผู้ใช้ = 3 (เกินแล้วแจ้งให้รอ)

#### FR-CHAT-026 — แชร์แชท
- คำอธิบาย: ระบบต้องให้สร้างลิงก์แชร์แชทแบบอ่านอย่างเดียว ผ่าน share popup: ตั้งวันหมดอายุ (ค่าเริ่มต้น/สูงสุดตาม BR-004), ตั้งรหัสผ่าน (ไม่บังคับ), คัดลอกลิงก์, ดูรายการลิงก์ที่มีและยกเลิก (revoke)
- Role: member+ · Priority: Should · Phase: P1
- Acceptance Criteria:
  - AC1: Given สร้างลิงก์ Then ได้ URL `/share/<token>` (token สุ่ม ≥128 บิต) และแชทมีป้าย "แชร์อยู่"
  - AC2: Given revoke Then เปิดลิงก์เดิมได้หน้า "ลิงก์นี้ไม่สามารถใช้งานได้"
  - AC3: ก่อนสร้างลิงก์ ระบบเตือน "ตรวจสอบว่าไม่มีข้อมูลส่วนตัวในแชทนี้" และสแกนหา PII (เลขบัตร/เบอร์โทร) แล้วแจ้งเตือนถ้าพบ
- หมายเหตุ (สิ่งที่เห็นบนหน้าจอ): ปุ่ม "แชร์ลิงก์" ที่หัวแชทเปิดกล่อง "แชร์แชทนี้เป็นลิงก์อ่านอย่างเดียว" มี "หมดอายุใน" 7/30/90/180/365 วัน (ตั้งต้น 30), ช่องติ๊ก "ตั้งรหัสผ่านให้ลิงก์", ปุ่ม "สร้างลิงก์"; หลังสร้างขึ้น "สร้างลิงก์แล้ว" + ปุ่ม "คัดลอก" + ข้อความ "ลิงก์นี้แสดงครั้งเดียว ระบบเก็บเฉพาะค่าแฮช ถ้าทำหาย ให้ยกเลิกแล้วสร้างใหม่" และรายการ "ลิงก์ที่ใช้งานอยู่" (วันหมดอายุ จำนวนครั้งที่เปิด ปุ่ม "ยกเลิกลิงก์"); โฮสต์ของลิงก์ที่สร้างเป็นโฮสต์ที่ผู้ใช้เปิดเว็บอยู่ ไม่ใช่ค่า `APP_URL`; หน้า `/share/<token>` มี "ถามต่อในนิติมิตร" และกล่องท้ายหน้าระบุว่าเป็นข้อมูลกฎหมายทั่วไปที่อ้างอิงจากคลังความรู้ของนิติมิตร

#### FR-CHAT-027 — ดูแชทที่ถูกแชร์
- คำอธิบาย: ระบบต้องแสดงแชทที่แชร์ในหน้า `/share/<token>` แบบอ่านอย่างเดียว (ไม่ต้อง login) พร้อม citation (เมื่อคำตอบมี), บรรทัด "ข้อมูล ณ วันที่ …", disclaimer, วันที่แชร์ และปุ่ม "ถามต่อในนิติมิตร" (เปิดแชทใหม่ของผู้ชมพร้อมคำถามแรกของแชทที่แชร์ — ไม่คัดลอกบทสนทนาทั้งหมดเป็น context เพื่อไม่ให้ข้อมูลของเจ้าของแชทตกไปอยู่ในแชทของผู้อื่น)
- Role: all (รวมผู้ไม่ได้ login) · Priority: Should · Phase: P1
- Acceptance Criteria:
  - AC1: Given ลิงก์มีรหัสผ่าน Then ต้องกรอกรหัสก่อน; ผิด 5 ครั้งล็อก 15 นาที
  - AC2: หน้าแชร์มี `noindex` และไม่แสดงชื่อ/อีเมลเจ้าของ
  - AC3: Given ลิงก์หมดอายุ Then แสดงหน้าหมดอายุ

#### FR-CHAT-028 — Export แชทเป็น PDF
- คำอธิบาย: ระบบต้องให้พิมพ์/บันทึกแชทเป็น PDF ผ่านหน้าพิมพ์ในเบราว์เซอร์ `/print/<chatId>` (ชื่อแชท, วันที่ พ.ศ., บทสนทนา, รายการอ้างอิง, disclaimer)
- Role: member+ · Priority: Could · Phase: P1
- Acceptance Criteria:
  - AC1: Given กด "พิมพ์ / PDF" Then เปิดหน้าพิมพ์ที่ไม่มี sidebar/header และสั่งพิมพ์/บันทึก PDF ได้
  - AC2: ฟอนต์ไทยแสดงถูกต้อง (ไม่มีสระลอย/ตัดคำผิดบรรทัด)

#### FR-CHAT-029 — การเลื่อนหน้าจอและปุ่ม Scroll-to-bottom
- คำอธิบาย: ระบบต้องมีปุ่มเลื่อนลงล่างสุด (อยู่ระหว่างพื้นที่ข้อความกับช่องพิมพ์ ตาม AI-EDW) เมื่อผู้ใช้ไม่ได้อยู่ท้ายแชท
- Role: all · Priority: Should · Phase: P1
- Acceptance Criteria:
  - AC1: Given ผู้ใช้เลื่อนขึ้นเกิน 200px จากท้าย Then ปุ่มปรากฏ; กดแล้วเลื่อนลงแบบ smooth

#### FR-CHAT-030 — จำแชทล่าสุดและ Deep link
- คำอธิบาย: ระบบต้องจำแชทล่าสุดที่เปิดของสมาชิก (`last_chat_id` ผ่าน `update_settings`; guest ไม่จำ) และเปิดแชทนั้นเมื่อกลับเข้า `/chat` โดยไม่มีพารามิเตอร์; รองรับ `/chat/<chatId>` และ `?q=<คำถาม>` (เติมช่องพิมพ์)
- Role: all · Priority: Should · Phase: P1
- Acceptance Criteria:
  - AC1: Given เปิด `/chat/<chatId ที่ไม่ใช่ของผู้ใช้>` Then แสดง "ไม่พบแชท" และเปิดแชทใหม่
  - AC2: Given `?q=` Then ข้อความถูกเติมแต่ยังไม่ส่ง (ป้องกันการส่งจากลิงก์ภายนอกโดยไม่ตั้งใจ)

#### FR-CHAT-031 — แสดง Safety Notice
- คำอธิบาย: เมื่อได้ event `safety_notice` ระบบต้องแสดงกล่องเด่น (สี warning/danger ตามระดับ) **เหนือ** คำตอบ มีหัวข้อ, ข้อความสั้น, และปุ่มโทรออก (`tel:`) ของสายด่วนที่ตรวจยืนยันแล้ว (ปัจจุบันยังไม่มีข้อมูลติดต่อที่ผ่านการตรวจ จึงยังไม่มีปุ่มโทร)
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given ระดับ `urgent` Then กล่องใช้สี danger, อยู่บนสุดของ bubble และถูกอ่านโดย screen reader ก่อน (`role="alert"`)
  - AC2: Given มีหมายเลขที่ตรวจยืนยัน When กดปุ่มโทรบนมือถือ Then เปิดแอปโทรศัพท์
  - AC3: safety notice ถูกเก็บกับข้อความและแสดงซ้ำเมื่อเปิดแชทย้อนหลัง

#### FR-CHAT-032 — แสดง Guardrail Bubble
- คำอธิบาย: เมื่อได้ event `guardrail` ระบบต้องแทนเนื้อหา bubble ด้วยกล่องแจ้งตาม `kind` + `stage`: `unavailable` (ระบบไม่พร้อม), `quota`/`quota` (ครบโควตา) — payload ตาม `03-technical-spec.md` §3.3 — ข้อความเป็นภาษาคนอ่านได้ ไม่มี JSON ดิบ และไม่มีปุ่ม actions ยกเว้นลองใหม่ (unavailable)
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given เปิดแชทย้อนหลังที่เคยแสดง guardrail bubble Then แสดงเหมือนตอน live
  - AC2: Given คำถามนอกขอบเขตของคลังความรู้ Then คำตอบ (ไม่ใช่ guardrail bubble) แนะนำว่าคลังครอบคลุมเรื่องใดบ้าง (FR-AI-004)

#### FR-CHAT-034 — แท็บ "ที่บันทึกไว้" (Saved Panel)
- คำอธิบาย: ระบบต้องมีหน้า "ที่บันทึกไว้" (`/saved`): รายการคำตอบที่ bookmark และบทความ/มาตรา/คู่มือ/แบบหนังสือ/คำศัพท์ที่บันทึก; รองรับค้นหา, ปักหมุด, เปลี่ยนชื่อ, ลบ
- Role: member+ · Priority: Should · Phase: P1
- Acceptance Criteria:
  - AC1: Given คลิกรายการคำตอบ Then เปิดแชทต้นทางและเลื่อนไปยังคำตอบนั้น (highlight 2 วินาที)
  - AC2: Given คลิกรายการบทความ Then เปิดหน้าเนื้อหานั้น
  - AC3: ค้นหากรองตามชื่อแบบ real-time

---

### 3.3 FR-AI — พฤติกรรมของเครื่องตอบ (Extractive Answer Engine) / Retrieval / Guardrails
> คำตอบของแชทมาจาก **เครื่องตอบแบบ extractive**: ระบบค้นคลังความรู้ที่ผ่านการจัดเก็บแล้ว (hybrid retrieval) แล้ว "เลือกและจัดเรียง" ข้อความที่มีอยู่แล้ว (บทความ, คู่มือ, ตัวบทคำต่อคำ, อภิธานศัพท์) — ไม่มีการแต่งข้อความกฎหมายขึ้นเอง; เมื่อเปิดใช้ ระบบอาจต่อท้ายด้วยบล็อกจาก API ฐานความรู้ของบริษัทที่ติดป้ายกำกับ (`03-technical-spec.md` §7.15); เมื่อเปิดโหมด `PNC_PRIMARY=true` (ระบบทดสอบตั้งไว้) แชทถาม API ของบริษัทก่อนและใช้คำตอบนั้นทั้งหมด — คำตอบแบบนี้บนหน้าจอไม่มีป้ายบอกแหล่งที่มา ไม่มีรายการอ้างอิงมาตรา ไม่มีคำถามต่อเนื่องหรือ "ขั้นตอนถัดไป" และไม่มีป้าย "ฉบับร่าง" แต่มีบรรทัดท้าย "ข้อมูล ณ วันที่ … · ข้อมูลนี้เป็นความรู้ทั่วไป ไม่ใช่คำปรึกษาทางกฎหมายสำหรับกรณีเฉพาะของคุณ" และปุ่มคัดลอก/ให้คะแนน/บันทึก/สร้างคำตอบใหม่ตามปกติ; ศัพท์ในอภิธานที่พบในคำตอบมีเส้นประใต้คำกดดูความหมายได้; หากเชื่อมต่อไม่ได้หรือ API ตอบว่าไม่พบ จะตอบจากคลังความรู้ภายในพร้อมรายการอ้างอิง
> รายละเอียดการ implement อยู่ใน `03-technical-spec.md` §4; ข้อกำหนดด้านล่างเป็น "พฤติกรรมที่ตรวจรับได้"

#### FR-AI-001 — Retrieval แบบ Hybrid ตามขอบเขต
- คำอธิบาย: ระบบต้องค้นเอกสารจาก `kb.chunks` ด้วย dense (bge-m3) + lexical (token/trigram) ก่อนเลือกข้อความตอบ โดยค้นเฉพาะเนื้อหา `published` (และ `draft` เฉพาะระบบทดสอบที่เปิด `KB_SERVE_DRAFTS` โดยติดป้าย "ฉบับร่าง") และตัวบทเวอร์ชันที่เหมาะสม (FR-AI-013) ภายใน Legal Scope (FR-CHAT-011)
- Role: system · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: ชุดทดสอบ retrieval (151 เคส, `eval.retrieval_eval`) ผ่านเกณฑ์ใน `03-technical-spec.md` §4.1
  - AC2: Given คำถามมีเลขมาตรา เช่น "มาตรา 383" Then มาตรานั้นต้องถูกเลือกเป็นคำตอบ (exact match)
  - AC3: เนื้อหา `in_review`/`archived` ต้องไม่ถูก retrieve (ทดสอบอัตโนมัติ); `draft` ไม่ถูก retrieve ใน production

#### FR-AI-002 — Citation สำหรับข้อเท็จจริงทางกฎหมาย
- คำอธิบาย: ข้อความตัวบทที่ปรากฏในคำตอบต้องผูก citation `[n]` ไปยังมาตราในคลังความรู้ และระบบต้องส่ง event `citations` ที่มี source id, ชนิด, label, ตำแหน่งในข้อความ, วันที่มีผล และสถานะ (published/draft)
- Role: system · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given คำตอบอ้างตัวบท Then ทุก marker `[n]` มี citation คู่กัน และเปิดดูข้อความมาตราคำต่อคำได้ (FR-CHAT-010)
  - AC2: Given อ้างมาตราที่ไม่มีในคลัง Then ระบบแจ้งว่า "ยังไม่มี… ในคลังความรู้" และไม่สร้าง citation

#### FR-AI-003 — การอ้างอิงต้องตรงกับคลังความรู้
- คำอธิบาย: การอ้างมาตรา/กฎหมายในคำตอบต้องถูก resolve กับ `kb.law_sections` ฉบับที่มีผลก่อนแสดงผล (ข้อความอ้างอิงในบทความเขียนเป็น token เช่น `[[law:ccc:383]]` แล้วแปลงเป็น citation) — ระบบไม่แสดงเลขมาตรา เลขฎีกา หรือชื่อกฎหมายที่ไม่มีในคลัง
- Role: system · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given token อ้างอิงที่ไม่มีมาตรานั้นในคลัง Then ข้อความที่ผู้ใช้เห็นไม่มีการอ้างนั้น
  - AC2: ผลตรวจเก็บใน `app.messages.verification` / `verification_status`; บล็อกจาก API ฐานความรู้ของบริษัท (ไม่มี citation) ถูกตั้ง `verification_status = warned` และบันทึก `app.guardrail_events` (`category=unverified_section`) — ดู `03-technical-spec.md` §7.15 (ในโหมด `PNC_PRIMARY` คำตอบจาก API บริษัทที่แสดงทั้งคำตอบไม่มีรายการอ้างอิงและไม่มีป้ายบอกแหล่งบนหน้าจอ)

#### FR-AI-004 — ตอบอย่างซื่อตรงเมื่อไม่มีข้อมูล
- คำอธิบาย: เมื่อ retrieval ไม่พบเอกสารที่เกี่ยวข้องเพียงพอ (score ต่ำกว่าเกณฑ์) หรือคำถามเป็นเรื่องนอกขอบเขตของคลังความรู้ (เช่น แรงงาน ครอบครัว อาญา จราจร ภาษี) ระบบต้องบอกผู้ใช้ตรง ๆ ว่ายังไม่มีข้อมูลในคลังความรู้ **ไม่เดาคำตอบ** พร้อมบอกขอบเขตที่คลังครอบคลุมและแนะนำให้ปรึกษาทนายความ
- Role: system · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given คำถามเรื่องที่ไม่มีเนื้อหาในคลัง Then คำตอบไม่มีการอ้างมาตรา และมีข้อความ "ยังไม่พบข้อมูลในคลังความรู้ของนิติมิตร…"
  - AC2: Given คำถามนอกขอบเขตที่ชัดเจน Then คำตอบระบุหมวดที่ถามว่ายังไม่อยู่ในคลัง

#### FR-AI-006 — คำตอบประกอบจากข้อความในคลังความรู้เท่านั้น
- คำอธิบาย: คำตอบต้องประกอบจากข้อความในคลังความรู้ที่ผู้ตรวจจัดการแล้ว โดยระบบเลือก เรียง และจัดรูปแบบเท่านั้น: (ก) ถามเรื่อง → แสดงบทความ/คู่มือที่ตรงที่สุดทั้งหัวข้อตามโครงของเนื้อหานั้น (สรุป → สิทธิ/หลักกฎหมาย → ขั้นตอน → เอกสาร → ระยะเวลา → เมื่อไรควรปรึกษาทนายความ ตามที่เนื้อหานั้นมี) (ข) ถามเลขมาตรา → แสดงตัวบทคำต่อคำพร้อมฉบับที่ใช้ (ค) ถามความหมายศัพท์ → แสดงคำจากอภิธานศัพท์ (ง) ไม่มีบทความตอบตรง แต่พบตัวบทที่เกี่ยวข้อง → แสดงตัวบทพร้อมข้อความว่าระบบยังอธิบายการใช้กับข้อเท็จจริงของผู้ใช้ไม่ได้
- Role: system · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: ทุกประโยคในคำตอบสืบย้อนไปยังเนื้อหาในคลังได้ (ชุดทดสอบ `eval.extractive_check`)
  - AC2: คำตอบมีบรรทัดปิดท้าย "ข้อมูล ณ วันที่ … · ข้อมูลนี้เป็นความรู้ทั่วไป ไม่ใช่คำปรึกษาทางกฎหมายสำหรับกรณีเฉพาะของคุณ"
  - AC3: Given เนื้อหาที่ใช้ตอบยังเป็นฉบับร่างที่ยังไม่ผ่านผู้ตรวจ Then คำตอบไม่แสดงป้าย/ข้อความเตือนเรื่องฉบับร่าง (ปรับเมื่อ 2026-10-01 ตามผู้ดูแลโครงการ) แต่ต้องไม่อ้างว่าผ่านการตรวจ (BR-027); หน้าคลังความรู้ยังมีป้าย "ฉบับร่าง"

#### FR-AI-008 — Disclaimer และ As-of Date
- คำอธิบาย: ทุกคำตอบเชิงกฎหมายต้องมี disclaimer สั้น (ข้อความมาตรฐาน ไม่ได้แต่งใหม่) และ "ข้อมูล ณ วันที่ …" (วันที่ของตัวบท/เนื้อหาล่าสุดที่ใช้) แสดงท้าย bubble
- Role: system · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given คำตอบมี citation Then footer ของ bubble แสดง as-of date เป็น พ.ศ. (locale th)
  - AC2: UI render disclaimer จาก i18n key `disclaimer_short` ที่ footer ของทุก assistant bubble ที่ `status=completed`

#### FR-AI-009 — Safety Triage
- คำอธิบาย: ระบบต้องจัดระดับความเร่งด่วนของทุกข้อความผู้ใช้ด้วยชุดคำสำคัญ (keyword) ตามหมวดใน BR-006 และส่ง event `safety_notice` (`level`: `urgent` | `caution`, `category`, `message`, `contacts[]` — payload ตาม `03-technical-spec.md` §3.3) ก่อนเริ่มคำตอบ; หมายเลขโทรศัพท์ใน `contacts[]` ต้องมาจากข้อมูลที่ตรวจยืนยันแล้วเท่านั้น — ขณะนี้ยังไม่มีข้อมูลติดต่อที่ผ่านการตรวจ กล่องแจ้งเตือนจึงมีข้อความคำแนะนำทั่วไปและยังไม่มีเบอร์โทร
- Role: system · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given ข้อความบ่งชี้ความรุนแรงในครอบครัว ถูกขู่ฆ่า ทำร้ายเด็ก หรือคิดทำร้ายตัวเอง Then `level=urgent` และกล่อง `safety_notice` แสดงก่อนคำตอบ
  - AC2: Given ข้อความบ่งชี้ว่าถูกจับกุม กำลังถูกหลอกโอนเงิน หรือเรื่องใกล้ครบกำหนด (เช่น ได้รับหมายเรียก) Then `level=caution`
  - AC3: ผลทดสอบ safety smoke set ต้องครบ 100% (NFR-LEGAL-008)

#### FR-AI-012 — Mask PII ก่อนค้นหา บันทึก และส่งต่อ
- คำอธิบาย: ระบบต้องตรวจและแทนที่ PII ในข้อความผู้ใช้ก่อนนำไปค้นหา ก่อนบันทึก log/retrieval log และก่อนส่งไป API ฐานความรู้ของบริษัท (เมื่อเปิดใช้): เลขประจำตัวประชาชน 13 หลัก (ตรวจ checksum), เบอร์โทร, อีเมล, เลขบัญชีธนาคาร ด้วย placeholder เช่น `[เลขบัตรประชาชน#1]`
- Role: system · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given ข้อความมีเลขบัตร 13 หลักที่ checksum ถูก Then ข้อความที่ใช้ค้นหา/บันทึกไม่มีเลขนั้น (ตรวจจาก test double)
  - AC2: Precision/recall ของ PII detector บน test set ≥ 0.95/0.95 สำหรับเลขบัตร/เบอร์โทร/อีเมล

#### FR-AI-013 — เลือกเวอร์ชันตัวบทตามวันที่
- คำอธิบาย: ระบบต้องใช้ตัวบทเวอร์ชันที่มีผล ณ วันที่อ้างอิง (`as_of`, ค่าเริ่มต้น = วันนี้ เขตเวลา Asia/Bangkok) และแสดงฉบับที่ใช้ (BR-009)
- Role: system · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given มาตรามี 2 เวอร์ชัน Then คำตอบใช้เวอร์ชันที่ `effective_from ≤ as_of < effective_to` และแสดง "ข้อความจาก: <ฉบับ>"
  - AC2: เวอร์ชันที่ยังไม่มีผล (effective_from ในอนาคต) ไม่ถูกใช้ตอบ

#### FR-AI-014 — ตั้งชื่อแชทอัตโนมัติ
- คำอธิบาย: หลังคำตอบแรกของแชท ระบบต้องตั้งชื่อแชทจากบรรทัดแรกของคำถาม (หลัง mask PII, ≤60 อักษร, ไม่ตัดกลางพยางค์ไทย) และส่ง event `title_update`
- Role: system · Priority: Should · Phase: P1
- Acceptance Criteria:
  - AC1: ชื่อไม่มีเลขบัตร/เบอร์โทร/อีเมล (สร้างจากข้อความที่ mask แล้ว)
  - AC2: ชื่อที่ผู้ใช้ตั้งเองไม่ถูกเขียนทับ (BR-013)

#### FR-AI-015 — Quota การใช้งาน
- คำอธิบาย: ระบบต้องตรวจ quota ข้อความรายวัน (ตาราง `app.usage_counters`) ก่อนประมวลผลคำถามทุกครั้ง และบันทึกจำนวนข้อความต่อวัน/ต่อผู้ใช้ — ไม่บันทึกข้อความดิบ
- Role: system · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given ครบ quota Then ไม่มีการค้นหา/ตอบ และส่ง event `guardrail` (`kind=quota`)
  - AC2: หน้า "การใช้งาน" ของหลังบ้าน (FR-ADM-016) รวมจำนวนข้อความรายวันได้จากข้อมูลนี้

#### FR-AI-017 — แนะนำให้ปรึกษาทนายความและไม่ทำนายผลคดี
- คำอธิบาย: ระบบต้องไม่ทำนายผลคดีเป็นตัวเลข/ความน่าจะเป็น และต้องแนะนำให้ปรึกษาทนายความเมื่อไม่มีข้อมูลตอบ เมื่อพบเพียงตัวบทโดยไม่อธิบายการใช้กับข้อเท็จจริง หรือเมื่อเรื่องมีมูลค่าสูง/มีกำหนดเวลา
- Role: system · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given ไม่พบข้อมูลในคลัง หรือตอบด้วยตัวบทอย่างเดียว Then คำตอบมีข้อความแนะนำให้ปรึกษาทนายความ
  - AC2: คำตอบไม่มีข้อความเช่น "โอกาสชนะ 80%" (ข้อความมาจากคลังความรู้ที่ผู้ตรวจจัดการแล้วเท่านั้น)

#### FR-AI-018 — ภาษาของข้อความระบบ
- คำอธิบาย: ข้อความที่ระบบเป็นผู้เขียน (คำนำ, บรรทัดปิดท้าย, ข้อความไม่พบข้อมูล, สถานะ) ต้องเป็นภาษาของ UI/ผู้ใช้ (th/en); เนื้อหาจากคลังความรู้เป็นภาษาไทย
- Role: system · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given ผู้ใช้ใช้ภาษา English Then คำนำ บรรทัดปิดท้าย และข้อความไม่พบข้อมูลเป็นภาษาอังกฤษ และระบุว่าเนื้อหาจากคลังเป็นภาษาไทย (ตัวบทภาษาไทยเป็นฉบับที่มีผลทางกฎหมาย)

#### FR-AI-020 — การจัดการเมื่อระบบค้นหาไม่พร้อม
- คำอธิบาย: เมื่อบริการค้นหา/ตอบไม่พร้อมใช้งาน ระบบต้องส่ง event `guardrail` (`kind=unavailable`) ที่อ่านเข้าใจได้ พร้อมปุ่มลองใหม่ และไม่ทำให้หน้าอื่น (คลังความรู้, คู่มือ, แบบหนังสือ) ใช้ไม่ได้
- Role: system · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given AI service ไม่พร้อม Then ผู้ใช้เห็นข้อความ "ระบบไม่พร้อมชั่วคราว กรุณาลองใหม่" + ปุ่มลองใหม่
  - AC2: ข้อความที่ล้มเหลวจากฝั่งระบบไม่นับ quota (BR-001)

---

### 3.4 FR-KB — M3 Knowledge Library

#### FR-KB-001 — หน้าแรกคลังความรู้
- คำอธิบาย: ระบบต้องแสดง `/library` เป็น grid การ์ดหมวด (ไอคอน, ชื่อ, จำนวนเนื้อหาแยกตามชนิด) พร้อมช่องค้นหาด้านบน — แสดงเฉพาะหมวดที่มีเนื้อหาในคลัง (ปัจจุบัน: หนี้และสัญญา, บุคคลและนิติกรรม, คุ้มครองผู้บริโภค, กระบวนการยุติธรรม); หมวดอื่นไม่แสดงจนกว่าจะมีเนื้อหา; หน้าเรนเดอร์ตามคำขอ (อยู่หลัง login)
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: หมวดและรหัสตรงกับ taxonomy ใน `01-blueprint.md` §6
  - AC2: บนมือถือ grid เป็น 1–2 คอลัมน์ ไม่มี horizontal scroll

#### FR-KB-002 — หน้าหมวด
- คำอธิบาย: ระบบต้องแสดง `/library/<category>`: คำอธิบายหมวด, หมวดย่อย, รายการเนื้อหาแยกแท็บตามชนิด (บทความ / ตัวบท / แบบหนังสือ / คำศัพท์ — ไม่มีแท็บคู่มือ), ตัวกรองระดับ (พื้นฐาน/ปฏิบัติ/เชิงลึก) และหมวดย่อย (อยู่ใน URL ส่งต่อได้) และ breadcrumb
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given เลือก filter ระดับ "พื้นฐาน" Then แสดงเฉพาะบทความระดับนั้น และ URL สะท้อน filter (แชร์ได้)
  - AC2: แสดง breadcrumb: คลังความรู้ › <หมวด>

#### FR-KB-003 — หน้าบทความ
- คำอธิบาย: ระบบต้องแสดงบทความ: ชื่อ, ระดับ, สรุปสั้น, เนื้อหา markdown พร้อม citation ที่เป็นลิงก์ไปมาตรา, "ฐานกฎหมาย" ท้ายบทความ, วันที่ปรับปรุงล่าสุด, ป้ายฉบับร่างเมื่อเนื้อหายังไม่ผ่านผู้ตรวจ, ปุ่มบันทึก (สมาชิก), ปุ่ม "ถามนิติมิตรเรื่องนี้" และ tooltip ศัพท์
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: หน้าเรนเดอร์ฝั่ง server มี `<title>` และ meta description
  - AC2: glossary tooltip ทำงานในบทความ (ใช้ component เดียวกับ FR-CHAT-015)

#### FR-KB-005 — รายการกฎหมาย
- คำอธิบาย: ระบบต้องแสดงรายการกฎหมายใน `/law` จัดกลุ่มตามประเภท (ประมวลกฎหมาย, พระราชบัญญัติ ฯลฯ) พร้อมค้นหาชื่อ/ชื่อย่อ (เช่น "ปพพ", "ป.พ.พ.")
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given พิมพ์ "ปพพ" Then พบ ประมวลกฎหมายแพ่งและพาณิชย์ (รองรับชื่อย่อแบบมี/ไม่มีจุด)
  - AC2: แต่ละรายการแสดงชื่อเต็ม, ปี พ.ศ., วันที่ปรับปรุงล่าสุด, จำนวนมาตรา

#### FR-KB-006 — อ่านตัวบท
- คำอธิบาย: ระบบต้องแสดงตัวบทเป็นรายการมาตรา (`/law/<code>`) พร้อมเลขวรรคที่ขอบซ้าย, ฉบับที่ใช้, วันมีผล (ถ้ายังไม่ยืนยันแสดง "ยังไม่ได้ยืนยัน"), แหล่งที่มา/ลิงก์ต้นฉบับทางการ, หัวข้อในคลังที่อ้างมาตรานั้น และปุ่ม "ถามนิติมิตรเรื่องนี้"
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: ทุกมาตราแสดงสถานะฉบับ (published/ฉบับร่าง) และแหล่งที่มา
  - AC2: ข้อความตัวบทต้องตรงกับต้นฉบับทางการ; ฉบับที่ยังไม่ผ่านผู้ตรวจติดป้ายฉบับร่าง (BR-027)

#### FR-KB-008 — การอ้างอิงไขว้
- คำอธิบาย: ระบบต้องแสดงที่หน้ามาตราว่า "หัวข้อที่อ้างมาตรานี้" (บทความ/คู่มือที่ published หรือ draft ตามโหมดของระบบ)
- Role: all · Priority: Should · Phase: P1
- Acceptance Criteria:
  - AC1: panel แสดงเฉพาะเนื้อหา published (ในระบบที่ไม่เปิดโหมดแสดงฉบับร่าง)

#### FR-KB-009 — ค้นหาแบบ Hybrid
- คำอธิบาย: ระบบต้องค้นหาเนื้อหาทุกชนิดด้วย hybrid search (คำ + ความหมาย) พร้อม filter หมวด/ชนิด (บทความ, แบบหนังสือ, คำศัพท์, ตัวบท)/ระดับ, แยกกลุ่มผลลัพธ์ตามชนิด, และปุ่ม "ถามนิติมิตรแทน" เมื่อผลลัพธ์น้อยหรือไม่พบ — ผ่าน `POST /v1/kb/search` ของ AI service
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given ค้น "ค่าปรับส่งงานช้า" Then บทความที่เกี่ยวข้องอยู่ในอันดับต้น
  - AC2: latency p95 ≤ 800ms (NFR-PERF-003)

#### FR-KB-010 — ค้นด้วยเลขมาตรา
- คำอธิบาย: ระบบต้องแปลงรูปแบบค้นหาเลขมาตรา เช่น "ปพพ 383", "ป.พ.พ. มาตรา 383", "ม.383 ปพพ", "CCC 383", เลขไทย "๓๘๓" ไปยังมาตรานั้นโดยตรง; ถ้าค้นมาตราที่ไม่มีในคลังต้องแจ้งว่าไม่พบ ไม่เดาให้
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given ค้น "ปพพ ๓๘๓" Then ผลแรกคือ ป.พ.พ. มาตรา 383 (มาตราที่พิมพ์ตรงขึ้นก่อนและมีป้าย "ตรงกับที่ค้นหา")
  - AC2: ใช้ได้ทั้งในช่องค้นหาคลังความรู้และหน้า `/law`

#### FR-KB-011 — อภิธานศัพท์
- คำอธิบาย: ระบบต้องมีหน้าอภิธานศัพท์ เรียงตามพจนานุกรมไทย + ตัวอักษรกระโดด + ค้นหา และหน้าคำศัพท์ (ความหมายสั้น/ยาว, คำที่ใช้เรียกอีกอย่าง, มาตราที่เกี่ยวข้อง, คำแปลอังกฤษ)
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: เรียงตามพจนานุกรมไทย (collation ไทย) ถูกต้อง
  - AC2: คำศัพท์ทุกคำเป็นแหล่งของ tooltip ใน FR-CHAT-015

#### FR-KB-014 — บันทึกเนื้อหา
- คำอธิบาย: ระบบต้องมีปุ่มบันทึก (ไปที่ "ที่บันทึกไว้") ในบทความ/มาตรา/คู่มือ/แบบหนังสือ/คำศัพท์ สำหรับสมาชิก
- Role: member+ · Priority: Should · Phase: P1
- Acceptance Criteria:
  - AC1: Given guest กดบันทึก Then แสดง prompt ชวนสมัคร

#### FR-KB-015 — ปุ่ม "ถามนิติมิตรเรื่องนี้"
- คำอธิบาย: ทุกหน้าเนื้อหาใน M3/M5/M6 ต้องมีปุ่มที่เปิดหน้าแชทพร้อมเติมคำถามให้ (`/chat?q=`) โดยไม่ส่งจนกว่าผู้ใช้กดส่งเอง
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given กดปุ่มจากบทความ Then เปิดหน้าแชทที่ช่องพิมพ์มีคำถามเติมไว้ (ไม่ส่งอัตโนมัติ)

#### FR-KB-016 — แสดงความสดใหม่ของเนื้อหา
- คำอธิบาย: ทุกเนื้อหาต้องแสดง "ปรับปรุงล่าสุด" (พ.ศ.) และป้าย "ฉบับร่าง — ยังไม่ผ่านผู้ตรวจเนื้อหา" จนกว่าจะมีบันทึกการอนุมัติจริงใน `kb.content_reviews` (BR-027)
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given เนื้อหาถูกอนุมัติและเผยแพร่ Then ป้ายฉบับร่างหายภายในไม่กี่วินาที

---

### 3.6 FR-GUIDE — M5 Procedure Guides

#### FR-GUIDE-001 — แคตตาล็อกคู่มือ
- คำอธิบาย: คู่มือขั้นตอนเปิดได้จากลิงก์อ้างอิงในคำตอบแชท การ์ด "ขั้นตอนถัดไป" ลิงก์ในบทความ/คู่มืออื่น และรายการ "ที่บันทึกไว้" ไปที่ `/guides/<slug>` — ไม่มีเมนูคู่มือใน sidebar ไม่มีลิงก์ในหน้า `/library` ไม่มีแท็บในหน้าหมวด และไม่อยู่ในตัวกรองชนิดของหน้าค้นหา (หน้า `/guides` ยังเปิดได้ด้วย URL แต่ไม่มีลิงก์ไป)
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: ลิงก์ไปคู่มือเปิดหน้า `/guides/<slug>`
  - AC2: เมนูหลักมีเฉพาะ ถามกฎหมาย, คลังความรู้, แบบหนังสือ, ที่บันทึกไว้ (+ หลังบ้านสำหรับทีมงาน)

#### FR-GUIDE-002 — โครงสร้างคู่มือ
- คำอธิบาย: คู่มือต้องแสดงตามโครงของเนื้อหา: ภาพรวม · ใครใช้ · เอกสาร (checklist) · ขั้นตอน · ระยะเวลา · ข้อควรระวัง · ฐานกฎหมาย (citation)
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: stepper บนมือถือแสดงเป็นแนวตั้ง
  - AC2: ส่วน "ฐานกฎหมาย" แสดงเป็นลิงก์ไปมาตราในคลัง

#### FR-GUIDE-003 — Checklist และความก้าวหน้า
- คำอธิบาย: ระบบต้องให้ติ๊ก checklist เอกสารและขั้นตอน; member บันทึกลง `app.guide_progress` (ใช้ต่อได้ทุกอุปกรณ์), guest เก็บ localStorage; แถบ "ทำแล้ว x จาก y"; มีปุ่ม "เริ่มใหม่" และ "ทำเสร็จแล้ว"
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given ติ๊กแล้ว reload Then สถานะยังอยู่

#### FR-GUIDE-005 — ลิงก์เนื้อหาที่เกี่ยวข้อง
- คำอธิบาย: ระบบต้องแสดงลิงก์ไปแบบหนังสือ (M6), คู่มือ/บทความอื่น และมาตราที่เกี่ยวข้องในเนื้อหาของคู่มือ
- Role: all · Priority: Should · Phase: P1
- Acceptance Criteria:
  - AC1: ลิงก์ไปเนื้อหาที่ถูก archive ถูกซ่อนอัตโนมัติ

#### FR-GUIDE-006 — พิมพ์/ดาวน์โหลดคู่มือ
- คำอธิบาย: ระบบต้องมี print stylesheet และปุ่ม "พิมพ์ / บันทึก PDF" ที่รวม checklist ให้ติ๊กบนกระดาษได้
- Role: all · Priority: Should · Phase: P1
- Acceptance Criteria:
  - AC1: หน้าพิมพ์ไม่มี sidebar/header/footer และมี URL + วันที่พิมพ์ท้ายหน้า

#### FR-GUIDE-007 — คู่มือในการค้นหาของแชท
- คำอธิบาย: เครื่องค้นของแชท (FR-AI-001) ค้นเนื้อหาคู่มือรวมกับเนื้อหาอื่นเพื่อใช้ตอบและเสนอ "ขั้นตอนถัดไป"; หน้าค้นหาในคลังความรู้ไม่มีกลุ่มผลลัพธ์ "คู่มือ"
- Role: all · Priority: Should · Phase: P1
- Acceptance Criteria:
  - AC1: Given คำถามที่ตรงกับคู่มือ Then การ์ด "ขั้นตอนถัดไป" ใต้คำตอบมีลิงก์ไปคู่มือนั้น

#### FR-GUIDE-008 — ถามนิติมิตรจากคู่มือ
- คำอธิบาย: ระบบต้องมีลิงก์ถามต่อในคู่มือและในแต่ละขั้นตอนที่เติมคำถามในหน้าแชท (`/chat?q=`)
- Role: all · Priority: Should · Phase: P1
- Acceptance Criteria:
  - AC1: Given กด "ถามนิติมิตร" ที่ขั้นตอนที่ 3 Then ช่องพิมพ์ในหน้าแชทมีคำถามเกี่ยวกับขั้นตอนนั้น (ยังไม่ส่ง)

---

### 3.7 FR-TPL — M6 Document Templates

#### FR-TPL-001 — แคตตาล็อกแบบหนังสือ
- คำอธิบาย: ระบบต้องแสดง `/templates`: รายการแบบหนังสือเกี่ยวกับสัญญา 5 แบบ (บอกกล่าวให้แก้ไข, บอกเลิกสัญญา, สงวนสิทธิ, โต้แย้งการหักค่าปรับ, แจ้งความชำรุดบกพร่อง) พร้อมคำอธิบาย "ใช้เมื่อไร", ปุ่มดาวน์โหลดแบบเปล่า (DOCX/PDF) และปุ่มกรอกผ่าน wizard
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: มีแบบหนังสืออย่างน้อย 5 แบบ ดาวน์โหลดได้ทั้ง DOCX และ PDF
  - AC2: ทุกแบบแสดง disclaimer ตาม FR-TPL-008 ก่อนดาวน์โหลด

#### FR-TPL-002 — Guided Wizard
- คำอธิบาย: ระบบต้องมี wizard กรอกแบบหนังสือทีละขั้น (≤ 5 ช่องต่อหน้า), แถบความก้าวหน้า, ย้อนกลับได้; ช่องอ่านจากตัวหนังสือของแบบ และประโยคที่มีเครื่องหมาย `[ถ้ามี: …]` จะถูกตัดทิ้งเมื่อช่องว่าง
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: ใช้งานด้วยคีย์บอร์ดได้ครบ, error message ผูกกับฟิลด์ (`aria-describedby`)

#### FR-TPL-003 — คำอธิบายรายช่อง
- คำอธิบาย: ช่องที่มีคำอธิบายในแบบต้องมีไอคอน (i) เปิดคำอธิบายพร้อมลิงก์มาตรา (เปิดด้วยคีย์บอร์ดได้)
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: ไอคอน (i) ข้างฟิลด์เปิดคำอธิบายแบบ popover ที่เข้าถึงด้วยคีย์บอร์ดได้

#### FR-TPL-004 — เตือนช่องที่ยังไม่ได้กรอก
- คำอธิบาย: ระบบต้องเตือนช่องที่ไม่ได้กรอก (ไม่บล็อกการสร้างไฟล์) และตรวจรูปแบบวันที่ผ่านช่องวันที่ของเบราว์เซอร์; ช่องที่ไม่ได้กรอกจะเป็น `[ชื่อช่อง]` ในไฟล์ให้กรอกเอง
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given ยังมีช่องว่าง Then หน้า "ตรวจทาน" แสดงคำเตือนแต่ยังดาวน์โหลดได้

#### FR-TPL-005 — ตัวอย่างก่อนสร้าง (Preview)
- คำอธิบาย: ระบบต้องแสดง preview หนังสือพร้อมไฮไลต์ส่วนที่มาจากคำตอบของผู้ใช้ และให้กดส่วนนั้นเพื่อกลับไปแก้ช่อง
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: คลิกข้อความที่ highlight Then กลับไปยังฟิลด์นั้นใน wizard

#### FR-TPL-006 — สร้างไฟล์ DOCX/PDF
- คำอธิบาย: ระบบต้องสร้าง DOCX และ PDF แบบ synchronous ใน AI service (ไม่ผ่านคิวงาน เพื่อไม่พักข้อมูลส่วนบุคคลในคิว) PDF ฝังฟอนต์ไทย + footer ทุกหน้า, DOCX ตั้งฟอนต์ TH Sarabun New; ไม่เก็บไฟล์ที่สร้างไว้ที่เซิร์ฟเวอร์; จำกัด 12 ไฟล์ต่อ 10 นาที
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: เวลาสร้าง p95 ≤ 10 วินาที
  - AC2: ข้อมูลที่กรอกไม่ถูกเก็บในฐานข้อมูลหรือ log

#### FR-TPL-007 — ร่างเก็บในเบราว์เซอร์
- คำอธิบาย: ข้อมูลที่กรอกใน wizard ต้องถูกจำไว้ในเบราว์เซอร์นี้เท่านั้น (ไม่ส่งไปเก็บที่เซิร์ฟเวอร์) และมีปุ่ม "ล้างข้อมูลที่กรอก"
- Role: all · Priority: Should · Phase: P1
- Acceptance Criteria:
  - AC1: Given ปิดหน้าไประหว่างทำ Then เปิดกลับมาในเบราว์เซอร์เดิมแล้วข้อมูลยังอยู่
  - AC2: Given กด "ล้างข้อมูลที่กรอก" Then ข้อมูลที่จำไว้ถูกลบ

#### FR-TPL-008 — Disclaimer ในเอกสาร
- คำอธิบาย: ทุกเอกสารที่สร้างต้องมีข้อความ "แบบตัวอย่างเพื่อการศึกษา ควรให้ผู้เชี่ยวชาญตรวจก่อนใช้กับธุรกรรมมูลค่าสูง" ในหน้าจอก่อนดาวน์โหลด และในส่วนท้ายของไฟล์ (DOCX footer / PDF ทุกหน้า)
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: ผู้ใช้ต้องติ๊กรับทราบ disclaimer ก่อนดาวน์โหลด (จำต่อ session)

#### FR-TPL-009 — ขอบเขต: ไม่ร่างคำคู่ความ
- คำอธิบาย: ระบบต้องไม่มีแบบหนังสือที่สร้างคำฟ้อง คำให้การ คำร้องต่อศาล หรือคำแถลงการณ์แทนผู้ใช้; แบบที่มีมีเฉพาะหนังสือระหว่างคู่สัญญา
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: CMS แก้ได้เฉพาะแบบเดิม ไม่มีการสร้างแบบใหม่ และไม่มีชนิด `pleading`

---

### 3.11 FR-ADM — M10 Back-office / Admin CMS

#### FR-ADM-001 — เข้าถึง Back-office ตามสิทธิ์
- คำอธิบาย: ระบบต้องแสดง `/admin/<section>` เฉพาะ editor/reviewer/admin โดยแต่ละแท็บแสดงตามสิทธิ์ (review: editor+reviewer+admin; content, laws: editor+admin; feedback, guardrails: reviewer+admin; users, audit, dsr, usage, announcement, orgs, system: admin)
- Role: editor, reviewer, admin · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given editor เปิด `/admin/users` Then HTTP 403 + audit log (**implement: หน้าจอตอบ 404 เพื่อไม่เปิดเผยว่ามีหน้านี้ + audit; API ตอบ 403 + audit**)
  - AC2: การเข้า admin ต้องผ่านการยืนยันตัวตนสองชั้น (TOTP) — NFR-SEC-006 (ระบบทดสอบที่ `APP_ENV=dev` ไม่บังคับ 2FA; หน้า "ผู้ใช้" เตือน "ยังไม่เปิด 2FA — เข้าหลังบ้านไม่ได้เมื่อระบบบังคับ" ใต้ชื่อทีมงานที่ยังไม่เปิด)
- หมายเหตุ (สิ่งที่เห็นบนหน้าจอ): เมนู "หลังบ้าน" ในแถบซ้ายต่อท้าย "ที่บันทึกไว้" และเห็นเฉพาะทีมงาน; แถบแท็บบนหน้า `/admin/*` — editor: "ภาพรวม | งานตรวจเนื้อหา | แก้ไขเนื้อหา | นำเข้าตัวบท"; reviewer: "ภาพรวม | งานตรวจเนื้อหา | คิว feedback | Guardrail"; admin: "ภาพรวม | งานตรวจเนื้อหา | แก้ไขเนื้อหา | นำเข้าตัวบท | คิว feedback | Guardrail | ผู้ใช้ | Audit log | คำขอใช้สิทธิ | การใช้งาน | ประกาศระบบ | องค์กร | ระบบ"; สมาชิกทั่วไปที่เปิด `/admin` ได้หน้า 404

#### FR-ADM-002 — จัดการเนื้อหา (CRUD) ด้วย Markdown Editor
- คำอธิบาย: ระบบต้องให้แก้เนื้อหา 4 ชนิด (บทความ, คู่มือ, แบบหนังสือ, คำศัพท์) ด้วย Markdown editor แบบ split preview (แก้ได้เฉพาะฉบับร่าง; ฉบับที่เผยแพร่แล้วเปลี่ยนโดยสร้างฉบับแก้ไขใหม่) และแทรก citation จากช่องค้นหามาตรา (autocomplete) — เนื้อหาใหม่จากไฟล์ใน `docs/knowledge-base/` นำเข้าด้วย `seed-kb` (FR-ADM-021)
- Role: editor, admin · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given พิมพ์ "ปพพ 383" ในช่องอ้างอิง Then แทรก citation token `[[law:ccc:383]]` ที่ผูกกับ `kb.law_sections`
  - AC2: autosave draft ทุก 10 วินาที; ป้องกันการแก้ชนกัน (optimistic lock ด้วย version number)

#### FR-ADM-003 — เวอร์ชันและ Diff
- คำอธิบาย: ระบบต้องเก็บทุกการบันทึกที่ส่ง review เป็นเวอร์ชัน (immutable) และแสดง diff ระหว่างเวอร์ชัน (ข้อความ + metadata)
- Role: editor, reviewer, admin · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: reviewer เห็น diff ระหว่างเวอร์ชันที่ส่งตรวจกับเวอร์ชัน published ล่าสุด
  - AC2: กู้คืน (restore) เวอร์ชันเก่าเป็น draft ใหม่ได้

#### FR-ADM-004 — Review Workflow
- คำอธิบาย: ระบบต้องบังคับ lifecycle `draft → in_review → published → archived` ตาม BR-007 (การตีกลับ = review action `requested_changes` ใน `kb.content_reviews` แล้วสถานะกลับเป็น `draft`): reviewer ติ๊กรายการตรวจครบทุกข้อจึงอนุมัติได้ ตีกลับ/ไม่อนุมัติต้องเขียนความเห็น; บันทึกใน `kb.content_reviews`
- Role: editor, reviewer · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given ผู้อนุมัติเป็นคนเดียวกับผู้ส่งเข้าตรวจล่าสุด Then ระบบปฏิเสธการอนุมัติ (403)
  - AC2: Given อนุมัติ Then เนื้อหา published, `reviewed_by/reviewed_at` ถูกบันทึก และ job reindex ถูกสร้าง (FR-ADM-007)
  - AC3: ทุกขั้นบันทึกประวัติ (ผู้ทำ, ความเห็น, เวลา) และ audit log

#### FR-ADM-005 — ตรวจเบื้องต้นของร่างเนื้อหา (Pre-check)
- คำอธิบาย: ขณะแก้และเมื่อส่ง review ระบบต้องรันการตรวจอัตโนมัติแบบ deterministic: (ก) การอ้างมาตราที่ไม่มีในคลัง (ข) ตัวเลขที่ไม่มีที่มา (ค) ถ้อยคำรับประกันผล — แสดงเป็นรายการคำเตือนให้ editor/reviewer; เป็นเพียงคำเตือน ไม่ใช่การรับรอง
- Role: editor, reviewer · Priority: Should · Phase: P1
- Acceptance Criteria:
  - AC1: Given ร่างอ้างมาตราที่ไม่มีในคลัง Then pre-check แสดงคำเตือน
  - AC2: pre-check ไม่ publish อะไรเอง

#### FR-ADM-007 — Reindex อัตโนมัติ
- คำอธิบาย: เมื่อเนื้อหา/ตัวบทถูก publish, archive หรือเปลี่ยนเวอร์ชัน ระบบต้องสร้าง job (worker) chunk + embed + upsert `kb.chunks` และถอด chunk ของเวอร์ชันที่ไม่ใช้แล้วออกจากการค้นหา
- Role: system · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: เนื้อหาที่ publish ถูกค้นเจอในแชทภายใน 10 นาที
  - AC2: เนื้อหาที่ archive ไม่ถูก retrieve ภายใน 10 นาที

#### FR-ADM-008 — นำเข้าตัวบทกฎหมาย
- คำอธิบาย: ระบบต้องให้อัปโหลดกฎหมาย (PDF ข้อความ, HTML, TXT) หรือวางข้อความ แล้ว parser แยกโครงสร้าง (บรรพ/ลักษณะ/หมวด/ส่วน/มาตรา, มาตรา "ทวิ/ตรี/…", "/1"), normalize เลขไทย, แสดงผลให้ตรวจแก้แบบตาราง (มาตรา | ข้อความ | สถานะ) ก่อนบันทึก พร้อม metadata (ชื่อ, ชื่อย่อ, ประเภท, วันประกาศราชกิจจานุเบกษา, วันมีผล, URL แหล่งทางการ, หมวด taxonomy)
- Role: editor, admin · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: parser แยกมาตราของ ป.พ.พ. จากไฟล์ทดสอบได้ถูกต้อง ≥ 99% (วัดจากจำนวนมาตราและเลขลำดับ)
  - AC2: ระบบแจ้งเตือนเลขมาตราที่ซ้ำ/ข้าม
  - AC3: ตารางตรวจแสดงคำเตือนและการเทียบกับฉบับเดิม; ผู้ตรวจต้องเทียบต้นฉบับทางการและใส่วันมีผลก่อนอนุมัติ

#### FR-ADM-009 — ออกเวอร์ชันตัวบท (Amendment)
- คำอธิบาย: ระบบต้องให้บันทึกการแก้ไขกฎหมาย: เลือกกฎหมายแก้ไข + วันมีผล + มาตราที่เพิ่ม/แก้/ยกเลิก → ระบบสร้าง `kb.law_versions` ใหม่ ปิด `effective_to` ของเวอร์ชันเดิม (ไม่ลบ) และติดธงบทความ/คู่มือที่อ้างมาตราเหล่านั้นให้ทบทวน
- Role: editor (สร้าง), reviewer (อนุมัติ) · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given ออกเวอร์ชันใหม่ที่แก้ ม.X Then เนื้อหาทุกชิ้นที่อ้าง ม.X ถูกตั้ง `review_due_at = now` และปรากฏในรายการทบทวน
  - AC2: ตัวบทเวอร์ชันใหม่ต้องผ่าน reviewer ก่อนใช้ใน RAG

#### FR-ADM-011 — Feedback Queue
- คำอธิบาย: ระบบต้องแสดงคิว feedback 👎 กรองตามเหตุผล/สถานะ (enum `app.review_state`: `open`, `triaged`, `resolved`, `wont_fix`); reviewer เห็นบทสนทนา (เฉพาะที่ผู้ใช้อนุญาตและไม่ใช่แชทขององค์กร, PII ถูก mask) และ citations; บันทึกคำตอบที่ถูกต้อง, root cause (retrieval/content_gap/outdated/guardrail/other), และสถานะ
- Role: reviewer, admin · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given ผู้ใช้ไม่อนุญาตให้ดูบทสนทนา Then reviewer เห็นเฉพาะเหตุผลและ metadata

#### FR-ADM-015 — Guardrail Logs
- คำอธิบาย: ระบบต้องแสดงรายการ guardrail events (เวลา, stage input/output, ชนิด, verdict, หมวด) พร้อมสถิติรายวัน และดูรายละเอียด (ข้อความที่ mask แล้วเท่านั้น) เพื่อตรวจ false positive
- Role: admin, reviewer · Priority: Should · Phase: P1
- Acceptance Criteria:
  - AC1: reviewer ทำเครื่องหมาย `false_positive` ได้

#### FR-ADM-016 — การใช้งานรายวัน
- คำอธิบาย: ระบบต้องแสดงหน้า "การใช้งาน" (`/admin/usage`): จำนวนสมาชิก/ผู้ใช้ทดลอง/องค์กร/แชท/สัญญา และจำนวนข้อความ ผู้ใช้ และข้อความในองค์กรต่อวัน (30 วัน) — ไม่มีเนื้อหาแชท
- Role: admin · Priority: Should · Phase: P1
- Acceptance Criteria:
  - AC1: export CSV ได้

#### FR-ADM-017 — จัดการผู้ใช้
- คำอธิบาย: ระบบต้องให้ admin ค้นหาผู้ใช้ (อีเมล/ชื่อ), ดูสถานะ, เปลี่ยน role, ระงับ/ยกเลิกระงับ, บังคับ logout, รีเซ็ต quota — admin ไม่เห็นเนื้อหาแชท/คดีของผู้ใช้
- Role: admin · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: ทุกการกระทำบันทึก audit log พร้อมเหตุผล (ช่องบังคับ)
  - AC2: Given ระงับผู้ใช้ Then session ทั้งหมดถูกยกเลิกทันที

#### FR-ADM-018 — Audit Log Viewer
- คำอธิบาย: ระบบต้องแสดง audit log (actor, action, target, ก่อน/หลัง (ไม่มีข้อมูลอ่อนไหว), IP hash, เวลา) กรองได้ และ export; audit log เป็น append-only
- Role: admin · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: ไม่มี UI/API ใดแก้ไขหรือลบ audit log ได้ (DB role ของแอปมีสิทธิ์ INSERT/SELECT เท่านั้น)

#### FR-ADM-021 — นำเข้าเนื้อหาจาก `docs/knowledge-base/` (seed-kb)
- คำอธิบาย: ระบบต้องมีคำสั่ง CLI `python -m app.cli seed-kb --path /kb` ที่นำเข้าไฟล์ Markdown + front-matter จาก `docs/knowledge-base/` แบบ idempotent (อ้างด้วย slug + content hash) เป็นฉบับร่างที่ต้องผ่าน review workflow; เนื้อหาที่แก้ในหลังบ้านแล้วจะไม่ถูกนำเข้าทับ
- Role: admin (CLI) · Priority: Must · Phase: P0
- Acceptance Criteria:
  - AC1: รันซ้ำ 2 ครั้งไม่สร้างข้อมูลซ้ำ
  - AC2: ไฟล์ที่ front-matter ผิด schema ถูกรายงานพร้อมเลขบรรทัด และไม่หยุดทั้ง batch

#### FR-ADM-022 — ประกาศระบบ (Announcement Banner)
- คำอธิบาย: ระบบอาจให้ admin ตั้งแถบประกาศ (ข้อมูล/ปิดปรับปรุง) พร้อมช่วงเวลาแสดง และภาษา
- Role: admin · Priority: Could · Phase: P1
- Acceptance Criteria:
  - AC1: ผู้ใช้ปิดแถบได้และไม่แสดงซ้ำสำหรับประกาศเดิม


#### FR-ADM-023 — จัดการคำขอสิทธิเจ้าของข้อมูล (DSR Queue)
- คำอธิบาย: admin ต้องเห็นคิว `app.dsr_requests` เรียงตาม `due_at` กรองตามประเภท/สถานะ เปลี่ยนสถานะ บันทึก `handled_by` และหมายเหตุ; คำขอ `erase` เชื่อมกับงานลบบัญชีใน worker
- Role: admin · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given คำขอเหลือ ≤ 7 วันก่อน `due_at` Then แสดงธงเตือนสีแดงในคิว และส่งอีเมลสรุปรายวันให้ admin/DPO
  - AC2: ทุกการเปลี่ยนสถานะถูกบันทึกใน `app.audit_log` (ไม่มีข้อมูลส่วนบุคคลเกินจำเป็น)

#### FR-ADM-024 — สวิตช์ฉุกเฉิน (Kill Switch)
- คำอธิบาย: admin ต้องหยุดแชทของผู้ทดลองใช้ / แชททั้งหมด / การอัปโหลดสัญญา ได้ทันทีที่หน้า `/admin/system` โดยไม่ต้อง deploy พร้อมข้อความถึงผู้ใช้ (เก็บใน `app.system_settings`)
- Role: admin · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: การเปิด/ปิดสวิตช์มีผลภายในไม่กี่วินาที, ประวัติแชทยังอ่านได้, และบันทึก audit log
  - AC2: เมื่อสวิตช์เปิด ผู้ใช้เห็นข้อความที่ admin ตั้งไว้ (guardrail `unavailable`) และมีตัวชี้วัด `lc_web_kill_switch_active`

---

### 3.12 FR-ORG — M11 Organization Workspace

#### FR-ORG-001 — สร้างองค์กร
- คำอธิบาย: member ต้องสร้างองค์กรได้ (ชื่อ และรหัสองค์กร/slug — ภาษาอังกฤษตัวเล็ก ตัวเลข หรือ `-`) ผ่านกล่องสลับพื้นที่ทำงานใน sidebar (`/org/new`) — ผู้สร้างเป็น `org_owner`; ข้อมูลเก็บใน `app.organizations` (Better Auth `organization` plugin)
- Role: member · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given ผู้ใช้ login แล้ว When สร้างองค์กร Then ผู้ใช้เป็น `org_owner` และกล่องสลับพื้นที่ทำงานใน sidebar แสดงชื่อองค์กร
  - AC2: Given slug ซ้ำ Then แจ้งให้เปลี่ยน และไม่สร้างองค์กร
  - AC3: guest สร้างองค์กรไม่ได้

#### FR-ORG-002 — เชิญสมาชิกทางอีเมล
- คำอธิบาย: `org_owner`/`org_admin` ต้องเชิญสมาชิกด้วยอีเมลพร้อมกำหนด role (`org_admin`, `org_member`, `org_counsel`); คำเชิญหมดอายุใน 7 วัน (`app.invitations`)
- Role: org_owner, org_admin · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given ส่งคำเชิญ Then ผู้รับได้อีเมลที่มีลิงก์ `accept_invitation` และคำเชิญแสดงสถานะ pending
  - AC2: Given คำเชิญเกิน 7 วัน When กดลิงก์ Then แจ้งว่าหมดอายุและให้ขอคำเชิญใหม่
  - AC3: Given ผู้รับยังไม่มีบัญชี When กดลิงก์ Then สมัครแล้วเข้าองค์กรทันทีหลังยืนยันอีเมล
- หมายเหตุ: ฟอร์มเชิญสมาชิก ("เชิญสมาชิกใหม่") ในหน้าสมาชิกและตั้งค่าแสดงเฉพาะเมื่อ `env.mailLive` เป็นจริง (`MAIL_LIVE=true` หรือ `SMTP_HOST` ไม่ใช่เครื่องนี้/mailpit) เพราะคำเชิญส่งทางอีเมล

#### FR-ORG-003 — จัดการสมาชิกและ role
- คำอธิบาย: `org_owner`/`org_admin` ต้องดูรายชื่อสมาชิก เปลี่ยน role และนำสมาชิกออกได้; `org_owner` โอนความเป็นเจ้าของได้; องค์กรต้องมี `org_owner` อย่างน้อย 1 คนเสมอ
- Role: org_owner, org_admin · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given `org_admin` พยายามเปลี่ยน role ของ `org_owner` Then ถูกปฏิเสธ (403)
  - AC2: Given นำสมาชิกออก Then สมาชิกเข้าข้อมูลขององค์กรไม่ได้ทันที (session ถัดไปไม่มีองค์กรนั้น) และข้อมูล `private` ของสมาชิกในองค์กรโอนให้ `org_owner` ตาม BR-026
  - AC3: ทุกการเปลี่ยน role/นำออก บันทึกใน `app.audit_log` พร้อม `org_id`

#### FR-ORG-004 — สลับองค์กร (Org Switcher)
- คำอธิบาย: ผู้ใช้ที่อยู่หลายองค์กรต้องสลับ "บริบทปัจจุบัน" ระหว่างพื้นที่ส่วนตัวกับแต่ละองค์กรได้จากกล่อง "พื้นที่ทำงาน" ใน sidebar (Better Auth `organization.setActive`); แชท/สัญญาที่สร้างใหม่ผูกกับบริบทปัจจุบัน
- Role: member · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given สลับเป็นองค์กร A Then sidebar แสดงเฉพาะแชท/โฟลเดอร์ของบริบทองค์กร A ที่ผู้ใช้เห็นได้ (ของตนเอง + ที่แชร์ทั้งองค์กร); แชทในพื้นที่ส่วนตัวเห็นเมื่อสลับกลับไปพื้นที่ส่วนตัว
  - AC2: Given สร้างแชทใหม่ขณะอยู่ในองค์กร A Then `app.chats.org_id` = A
- หมายเหตุ (สิ่งที่เห็นบนหน้าจอ): ปุ่มสลับพื้นที่ทำงาน (aria "สลับพื้นที่ทำงาน") แสดงชื่อพื้นที่กับคำรอง "พื้นที่ทำงาน" (ส่วนตัว) หรือ "องค์กร"; ผู้ไม่มีองค์กรเห็น "ส่วนตัว" + "สร้างพื้นที่ทำงานองค์กร"; สมาชิกองค์กรเห็น "ส่วนตัว" | ชื่อองค์กร | "สร้างพื้นที่ทำงานองค์กร" — เข้าระบบแล้วอยู่ที่ "ส่วนตัว" ก่อนและต้องเลือกองค์กรเอง; เมื่อเลือกองค์กร แถบซ้ายมีหัวข้อ "องค์กร": เจ้าขององค์กรเห็น "สมาชิกและตั้งค่า", "สัญญาขององค์กร", "ส่งเรื่องให้ที่ปรึกษา", "การใช้งาน", "บันทึกการตรวจสอบ"; สมาชิกทั่วไป (`org_member`) เห็นเฉพาะสามรายการแรก (เปิด `/org/usage` หรือ `/org/audit` ได้หน้า 404); ผู้ที่ยังอยู่ "ส่วนตัว" แล้วเปิดหน้าองค์กรจะถูกพาไปหน้า "สร้างพื้นที่ทำงานองค์กร"

#### FR-ORG-005 — Visibility ภายในองค์กร
- คำอธิบาย: แชท โฟลเดอร์ และสัญญาในองค์กรต้องมี visibility `private` (เฉพาะผู้สร้าง + `org_counsel` เมื่อถูกส่งต่อ) หรือ `org` (สมาชิกทุกคนอ่านได้); ค่าเริ่มต้น `private`
- Role: org_member · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given สมาชิก B เปิด URL แชท `private` ของสมาชิก A Then ได้ 404 (ไม่เปิดเผยว่ามีอยู่)
  - AC2: Given เปลี่ยนเป็น `org` Then สมาชิกทุกคนในองค์กรเห็นแบบอ่านอย่างเดียว

#### FR-ORG-006 — การแยกข้อมูลระหว่างองค์กร (Tenant Isolation)
- คำอธิบาย: ทุกคำขอที่อ่าน/เขียนข้อมูลขององค์กรต้องตรวจว่าผู้ใช้เป็นสมาชิกของ `org_id` นั้นและมี role ที่พอ; retrieval ของ AI ต้องไม่ดึงข้อมูลของลูกค้าองค์กรอื่น (สัญญาของลูกค้าไม่เข้า `kb.chunks` สาธารณะ)
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given ผู้ใช้ขององค์กร A เรียก API ด้วย id ของทรัพยากรองค์กร B Then ได้ 404 และบันทึก `app.audit_log` (event `cross_tenant_denied`)
  - AC2: ชุดทดสอบ tenant isolation อัตโนมัติรันทุก PR และต้องผ่าน 100% (NFR-SEC-012)

#### FR-ORG-007 — Quota และแพ็กเกจรายองค์กร
- คำอธิบาย: องค์กรต้องมี quota ข้อความแชทต่อสมาชิกต่อวันและจำนวนที่นั่ง (BR-023) ที่ admin ระบบตั้งได้รายองค์กร (`/admin/orgs`); `org_owner`/`org_admin` เห็นการใช้งานใน `/org/usage`
- Role: org_owner, org_admin, admin · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given สมาชิกใช้ข้อความครบ quota ของวันในพื้นที่องค์กร When ส่งข้อความ Then แจ้ง guardrail `quota` (นับแยกจากพื้นที่ส่วนตัว)
  - AC2: หน้า usage แสดงจำนวนข้อความรายคน (ไม่แสดงเนื้อหา)

#### FR-ORG-008 — Audit Log ขององค์กร
- คำอธิบาย: `org_owner`/`org_admin` ต้องดู audit log ขององค์กร (เข้าร่วม/ออก, เปลี่ยน role, อัปโหลด/ลบสัญญา, export, share_to_counsel, เปลี่ยน retention) กรองตามช่วงเวลา/ผู้ใช้/ประเภท และ export CSV ได้
- Role: org_owner, org_admin · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: log ไม่มีเนื้อหาแชทหรือเนื้อหาสัญญา มีเฉพาะ actor, action, resource id, เวลา
  - AC2: log เป็น append-only และเก็บตาม §6.2

#### FR-ORG-009 — ตั้งค่า Retention ขององค์กร
- คำอธิบาย: `org_owner`/`org_admin` ต้องตั้งระยะเวลาเก็บไฟล์สัญญาและข้อความที่สกัด (30/90/180/365 วัน หรือ "จนกว่าจะลบ") ได้ใน `app.org_settings`; job ลบอัตโนมัติตามค่าที่ตั้ง (BR-024)
- Role: org_owner, org_admin · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given ตั้ง 90 วัน Then สัญญาที่เก่ากว่า 90 วันถูกลบทั้งไฟล์และข้อความที่สกัดโดยงานเบื้องหลัง
  - AC2: การเปลี่ยนค่าบันทึกใน audit log

#### FR-ORG-010 — ส่งเรื่องให้ที่ปรึกษากฎหมายขององค์กร (share_to_counsel)
- คำอธิบาย: สมาชิกต้องส่งแชทของตนให้ `org_counsel` พร้อมข้อความประกอบ; `org_counsel` เห็นในคิว "ส่งเรื่องให้ที่ปรึกษา" (`/org/counsel`) และตอบกลับเป็นความเห็นได้ — ความเห็นเป็นของที่ปรึกษาขององค์กร ไม่ใช่ของระบบ
- Role: org_member, org_counsel · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given องค์กรไม่มี `org_counsel` Then ปุ่มส่งต่อถูกซ่อน และแสดงข้อความแนะนำให้ปรึกษาทนายความโดยตรง
  - AC2: Given ส่งต่อแล้ว Then `org_counsel` ได้รับแจ้งทางอีเมล และเห็นเฉพาะรายการที่ถูกส่งถึง (ไม่เห็นแชท `private` อื่นของผู้ส่ง)

#### FR-ORG-011 — ออกจากองค์กรและลบองค์กร
- คำอธิบาย: สมาชิกต้องออกจากองค์กรได้เอง; `org_owner` ลบองค์กรได้หลังพิมพ์ชื่อยืนยัน — ทุกคนเข้าไม่ได้ทันทีและได้อีเมลแจ้ง, `org_owner` ยกเลิกได้ภายใน 30 วัน, จากนั้นข้อมูลองค์กรทั้งหมด (สมาชิก แชท สัญญา) ถูกลบถาวร
- Role: org_member, org_owner · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given `org_owner` คนสุดท้ายกดออก Then ต้องโอนเจ้าของหรือลบองค์กรก่อน
  - AC2: การลบองค์กรสร้าง job ที่ตรวจสอบได้ว่าลบครบ (จำนวนแถว/ไฟล์ที่ลบ)

---

### 3.13 FR-CR — M12 Contract Review (รับไฟล์ อ่านข้อความ แยกข้อ และตรวจสัญญา)

> ขอบเขต: อัปโหลด → สแกนไวรัส → เข้ารหัสและเก็บ → อ่านข้อความ → แยกเป็นข้อ → ตรวจรายข้อ (ปุ่ม "ตรวจสัญญา") → ลบ
> สถานะ ณ 2026-10-01: ตัวตรวจเลือกด้วย `CONTRACT_REVIEW_BACKEND` = `off` (ปริยาย) | `mock` | `http` | `pnc` — `pnc` ส่งข้อสัญญาที่ปกปิด PII แล้วไปถาม API แชทของบริษัททีละข้อ (สูงสุด 30 ข้อ) ได้คำตอบข้อความโดยไม่มีระดับความเสี่ยง (`unrated`) และไม่มีแหล่งอ้างอิง; `mock` ให้ผลจำลองที่ติดป้าย "ผลจำลองสำหรับทดสอบระบบ" และถูกปฏิเสธเมื่อ `APP_ENV=prod`; `http` เรียก API ตรวจสัญญาของบริษัท (รูปแบบข้อมูลของ API อยู่ใน `03-technical-spec.md` §7.16) ซึ่งยังไม่ได้เชื่อมต่อ จึงใช้ได้ `mock` และ `pnc` ในระบบทดสอบ

#### FR-CR-001 — อัปโหลดสัญญา
- คำอธิบาย: สมาชิกองค์กรต้องอัปโหลดสัญญา PDF/DOCX (≤ `CONTRACT_MAX_MB` = 20 MB, ≤ `CONTRACT_MAX_PAGES` = 50 หน้า) ที่ `/contracts` (`upload_contract`) — ไฟล์ผ่านการตรวจชนิดจากเนื้อไฟล์ (magic bytes) + สแกนไวรัส (ClamAV) แล้วเก็บใน MinIO แบบเข้ารหัส แยกตาม `org_id` (`app.contracts`) — เข้ารหัสทั้งไฟล์ด้วย key ต่อไฟล์ในหน่วยความจำ (ไม่ใช่ stream แบบ chunk) เพราะไฟล์ ≤ 20 MB
- Role: org_member · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given ไฟล์เกินขนาด/หน้า ติดรหัสผ่าน หรือชนิดไม่รองรับ Then ปฏิเสธพร้อมเหตุผลที่อ่านเข้าใจ
  - AC2: Given ไฟล์ติดไวรัส Then ปฏิเสธ ลบไฟล์ และบันทึก audit
  - AC3: Given อัปโหลดสำเร็จ Then สัญญาอยู่ในรายการ `/contracts` สถานะ `uploaded` visibility `private`

#### FR-CR-002 — สกัดข้อความและแยกข้อสัญญา
- คำอธิบาย: ระบบต้องสกัดข้อความจาก PDF ที่มี text layer และ DOCX พร้อมเลขหน้า แยกเป็นข้อตามเลข "ข้อ" และแสดงชื่อคู่สัญญาที่ตรวจพบ (ยังไม่ได้ยืนยัน) — เป็นการแยกอัตโนมัติที่อาจคลาดเคลื่อน ผู้ใช้ต้องเทียบกับต้นฉบับ; ถ้าไฟล์ไม่มีข้อความ (สแกนเป็นภาพ) ต้องแจ้งว่ายังไม่รองรับ
- Role: org_member · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given PDF ที่ข้อความน้อยกว่าเกณฑ์ต่อหน้า Then สถานะ `unsupported_scan` และแนะนำให้อัปโหลดไฟล์ต้นฉบับ
  - AC2: ข้อความที่สกัดเก็บแบบเข้ารหัส และไม่เข้า `kb.chunks`
  - AC3: Given อ่านไฟล์เสร็จ Then สถานะ `ready` และหน้ารายละเอียดแสดงข้อสัญญาพร้อมเลขหน้า

#### FR-CR-009 — ลบสัญญา
- คำอธิบาย: ผู้อัปโหลด, `org_admin` หรือ `org_owner` ต้องลบสัญญาได้ (`delete_contract`; ผู้ดูแลลบได้แม้อ่านเนื้อหาไม่ได้) — สัญญาหายจากรายการทันที และงานเบื้องหลังลบไฟล์และข้อความที่สกัดออกถาวรภายใน 1 ชั่วโมง
- Role: org_member, org_admin, org_owner · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given ลบแล้ว Then เรียก `get_contract` ได้ 404 และ object ใน MinIO ถูกลบ (ตรวจได้จาก job log)

#### FR-CR-010 — ไม่นำข้อมูลลูกค้าไปใช้นอกวัตถุประสงค์ของบริการ
- คำอธิบาย: ระบบต้องไม่ใช้สัญญา ข้อความที่สกัด หรือแชทขององค์กรนอกวัตถุประสงค์ของบริการ — ข้อความนี้ต้องอยู่ในข้อกำหนดบริการ/DPA
- Role: all · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: ข้อความสัญญาไม่ถูกเก็บใน `kb.chunks`, log หรือตารางอื่นนอกจาก `app.contracts` (เข้ารหัส) และผลตรวจ (เข้ารหัส เก็บเลขข้อกับข้อความสั้นเท่านั้น)

#### FR-CR-011 — ตรวจสัญญารายข้อ
- คำอธิบาย: ในหน้า `/contracts/[id]` สมาชิกที่อ่านสัญญาได้กด "ตรวจสัญญา" (`start_contract_review`, `POST /api/v1/contracts/{id}/review`) เมื่อสถานะสัญญา `ready`/`reviewed` และตัวตรวจไม่ใช่ `off` → สร้างแถวใน `app.contract_reviews` + งาน `review_contract` (migration 0025); worker ปกปิด PII ในข้อสัญญาก่อนส่งให้ตัวตรวจ แล้วเก็บผลแบบเข้ารหัส (เก็บเฉพาะผลล่าสุด) — ผลประกอบด้วยสรุปสาระสำคัญ (คู่สัญญา ระยะเวลา การชำระเงิน การเลิกสัญญา ค่าปรับ กฎหมายและศาลที่ใช้บังคับ) และผลรายข้อระดับ เสี่ยงสูง/ปานกลาง/ต่ำ/ไม่พบประเด็น พร้อมข้อเสนอแนะ; หน้าจอกรองตามระดับได้ มี disclaimer ว่าเป็นข้อมูลทั่วไป (ข้อความข้างต้นเป็นรูปแบบผลของตัวตรวจที่ให้ระดับความเสี่ยง; ตัวตรวจ `pnc` ที่ระบบทดสอบใช้อยู่ให้ผลตามที่ระบุใน AC2b); `get_contract_review` (`GET` ที่ path เดียวกัน) คืนผลล่าสุด
- Role: org_member (ผู้ที่อ่านสัญญานั้นได้) · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: Given ตัวตรวจเป็น `off` Then ไม่มีปุ่ม/แผงตรวจสัญญาในหน้าสัญญา และ `start_contract_review` ตอบ `REVIEW_DISABLED`
  - AC2: Given ตัวตรวจเป็น `mock` และตรวจเสร็จ Then แสดงป้าย "ผลจำลองสำหรับทดสอบระบบ" ข้างหัวข้อผลตรวจ; `mock` ไม่อ้างมาตรา/ตัวเลขของตนเอง และถูกปฏิเสธเมื่อ `APP_ENV=prod`
  - AC2b: Given ตัวตรวจเป็น `pnc` และตรวจเสร็จ Then ผลรายข้อเป็นข้อความคำตอบ (render ผ่าน Markdown ที่ sanitize, ยาวแล้วพับ "ดูทั้งหมด") ไม่มีป้ายหรือตัวกรองระดับความเสี่ยง และไม่ถูกนับเป็น "ไม่พบประเด็น"; ข้อที่ไม่ได้รับคำตอบแสดง "ไม่ได้รับคำตอบสำหรับข้อนี้"; สัญญาเกิน 30 ข้อแจ้งจำนวนข้อที่ไม่ได้ตรวจ; ถ้าไม่ได้คำตอบเลยสักข้อการตรวจล้มเหลวด้วยรหัส (เช่น `REVIEW_NO_ANSWER`, `REVIEW_TIMEOUT`)
  - AC2c: หน้าจอที่เห็นจริงเมื่อใช้ตัวตรวจ `pnc`: หัวข้อ "ตรวจสัญญา" มีปุ่ม "ตรวจสัญญา" (หลังตรวจเป็น "ตรวจอีกครั้ง") พร้อมข้อความว่าระบบส่งสัญญาไปสอบถามฐานความรู้กฎหมายของบริษัททีละข้อ (สูงสุด 30 ข้อแรก) และข้อความของแต่ละข้อที่ปกปิดข้อมูลส่วนบุคคลแล้วถูกส่งไปยังบริการของบริษัท PromptNow; ระหว่างตรวจขึ้นป้าย "กำลังตรวจสัญญา" และ "กำลังสอบถามทีละข้อ อาจใช้เวลาหลายนาที…"; ผลมีกล่อง "สรุปสาระสำคัญ" ที่มีเฉพาะแถว "คู่สัญญา" (ติดป้ายว่าดึงจากข้อความ ยังไม่ได้ยืนยัน) และหัวข้อ "ผลตรวจรายข้อ" เป็นการ์ดต่อข้อ (เช่น "ข้อ 1 — ขอบเขตงาน") ที่มีข้อความ "ความเสี่ยง: …" และ "วิธีแก้ไข: …" และลิงก์ "ดูทั้งหมด"; ไม่มีป้ายระดับความเสี่ยง ไม่มีการอ้างมาตรา และไม่มีปุ่มส่งออกหรือส่งให้ที่ปรึกษา; ท้ายผลมีข้อความว่าเป็นข้อมูลกฎหมายทั่วไป ควรให้ทนายความตรวจสัญญาก่อนลงนาม
  - AC3: Given กดตรวจซ้ำขณะยังตรวจอยู่ Then ตอบ `REVIEW_RUNNING`; ถ้าไม่มีผลเกิน 15 นาทีถือว่าค้าง ให้ตรวจใหม่ได้
  - AC4: Given ตรวจครบโควตารายเดือนขององค์กร (`app.org_settings.contract_reviews_monthly` ค่าเริ่มต้น 50, ผู้ดูแลระบบปรับได้) Then ตอบ `REVIEW_QUOTA`; rate limit ต่อผู้ใช้ (`RATE_REVIEW_PER_MIN`); สวิตช์ฉุกเฉิน "การอัปโหลดสัญญา" หยุดการตรวจด้วย (`UPLOADS_PAUSED`)
  - AC5: ความล้มเหลวของตัวตรวจแสดงเป็นรหัสที่มีข้อความอธิบาย (เช่น `REVIEW_UNAVAILABLE`, `REVIEW_TIMEOUT`) ไม่แสดงข้อความสัญญา; ผู้อ่านสัญญาเท่านั้นเรียกดูผลได้ (คนอื่นได้ 404); การเริ่มตรวจบันทึก audit `org.contract_review_started`

#### FR-CR-012 — รายการสัญญาขององค์กร
- คำอธิบาย: `/contracts` ต้องแสดงรายการสัญญา (ชื่อไฟล์, คู่สัญญาที่ตรวจพบ, สถานะ, ผู้อัปโหลด, วันที่) ตาม visibility และให้เปลี่ยน visibility เป็น "ทั้งองค์กร" ได้ในหน้าสัญญา
- Role: org_member · Priority: Must · Phase: P1
- Acceptance Criteria:
  - AC1: สมาชิกเห็นเฉพาะสัญญาของตัวเองและที่เป็น `org` (BR-024)

---

## 4. External Interface Requirements

### 4.1 User Interfaces
- รายละเอียด layout, design tokens, component, หน้าจอ และ state อยู่ใน `03-technical-spec.md` §5 (+ ภาพใน `docs/prototype/index.html`)
- UI-1: App shell 3 คอลัมน์ตาม AI-EDW (sidebar 280px, header 60px, right panel พับได้, footer) — ที่เห็นบนหน้าจอ: แถบซ้ายมีปุ่ม "แชทใหม่" และหัวข้อ "เมนูหลัก" = "ถามกฎหมาย", "คลังความรู้", "แบบหนังสือ", "ที่บันทึกไว้" (ทีมงานมี "หลังบ้าน" ต่อท้าย) แล้วส่วน "แชทล่าสุด" (ปุ่ม "โฟลเดอร์ใหม่", ช่อง "กรองแชท…"); แถบบนมีสวิตช์ธีม สว่าง/มืด/ตามระบบ, ภาษา "ไทย" | "EN" และเมนูผู้ใช้ ("ตั้งค่าบัญชี", "ออกจากระบบ" — ทุกบทบาทเหมือนกัน); footer มี "v1.0.0" ข้อความ "ข้อมูลกฎหมายทั่วไป ไม่ใช่คำปรึกษาทางกฎหมายเฉพาะกรณี" และนาฬิกานับถอยหลังเซสชัน ไม่มีลิงก์ข้อกำหนด/ความเป็นส่วนตัวใน footer (ลิงก์อยู่ที่หน้าเข้าสู่ระบบ/สมัครสมาชิก/ยอมรับข้อกำหนด); หน้า `/share/*` ไม่มีแถบซ้ายและ footer
- UI-2: ทุกหน้ารองรับ light/dark, desktop/tablet/mobile (breakpoint 1024/768/576/480)
- UI-3: ข้อความ error ต้องบอก (ก) เกิดอะไรขึ้น (ข) ผู้ใช้ทำอะไรต่อได้ — ไม่แสดง stack trace/JSON ดิบ
- UI-4: วันที่แสดงแบบ พ.ศ. เมื่อ locale = th; ตัวเลขใช้เลขอารบิก (รับ input เลขไทยได้)

### 4.2 Hardware Interfaces
ไม่มีการเชื่อมต่อฮาร์ดแวร์เฉพาะ; รองรับการโทรออกผ่าน `tel:` link (เมื่อมีหมายเลขที่ตรวจยืนยัน)

### 4.3 Software Interfaces
| ID | ระบบ | ทิศทาง | วัตถุประสงค์ | หมายเหตุ |
|---|---|---|---|---|
| SI-1 | AI service (FastAPI, ภายใน) | web → ai | แชท streaming, ค้นหา, นำเข้าตัวบท/เนื้อหา, สร้างไฟล์แบบหนังสือ, อ่านสัญญา | service token + เครือข่ายภายใน; สเปกใน `03-technical-spec.md` §3 |
| SI-2 | API ฐานความรู้ของบริษัท (PromptNow chatbot) | ai → ภายนอก | คำตอบเสริม ไม่มี citation (ไม่ต้องติดป้ายกำกับ) | ปิดเป็นค่าเริ่มต้น; ส่งเฉพาะข้อความที่ mask PII แล้ว — `03-technical-spec.md` §7.15 |
| SI-3 | Embedding service (bge-m3) | ai/worker → embed | embedding | ภายใน |
| SI-4 | PostgreSQL 16 (+pgvector, pg_trgm) | web, ai, worker | ข้อมูลทั้งหมด | schema `app`, `kb`; DB role แยกตาม service |
| SI-5 | Redis 7 | web | ตัวนับ rate limit (ถ้าใช้ไม่ได้ ใช้ตัวนับในหน่วยความจำ) — session และ quota รายวันอยู่ใน Postgres | |
| SI-6 | SMTP | web, worker → ภายนอก | อีเมลยืนยัน, reset, คำเชิญองค์กร, แจ้งเตือน | SPF/DKIM/DMARC; ลิงก์ลืมรหัสผ่านและฟอร์มเชิญสมาชิกเปิดเฉพาะเมื่อ `env.mailLive` (`MAIL_LIVE=true` หรือ SMTP จริง) |
| SI-7 | Object storage (MinIO) | web, worker | ไฟล์สัญญา (เข้ารหัส) | bucket `lc-private` |
| SI-8 | ClamAV | web | สแกนไวรัสไฟล์อัปโหลด | |
| SI-9 | แหล่งกฎหมายทางการ (ราชกิจจานุเบกษา, สำนักงานคณะกรรมการกฤษฎีกา) | editor → ภายนอก | ต้นฉบับตัวบท | ดาวน์โหลดแบบ manual แล้วอัปโหลดผ่านหลังบ้าน — ดู `03-technical-spec.md` §6 |

### 4.4 Communication Interfaces
- CI-1: HTTPS (TLS 1.2+, แนะนำ 1.3) ทุกการเชื่อมต่อจาก browser; HSTS
- CI-2: JSON API: Next.js Route Handlers ใต้ `/api/v1/...` แบบ REST (GET = อ่าน, POST/PATCH/DELETE = เขียน, body JSON); ทุก endpoint มี **operationId** = ชื่อ action ใน SRS นี้ (เช่น `new_chat` = `POST /api/v1/chats`) — ตาราง operationId → method + path อยู่ใน `03-technical-spec.md` §3; response `{success, data?, error?, error_code?, build}`; request ที่เปลี่ยนสถานะต้องผ่านการตรวจ Origin ใน `proxy.ts` (Next.js 16) และ header `X-CSRF-Token` (double-submit cookie `lc_csrf`)
- CI-3: Streaming: `POST /api/v1/chat/stream` (Route Handler, Node runtime) → `text/event-stream` (อ่านด้วย `fetch` + `ReadableStream`, ไม่ใช้ `EventSource`) — event names ที่อนุญาต:
  `chat_id`, `status`, `chunk`, `citations`, `suggestions`, `safety_notice`, `guardrail`, `complete`, `title_update`, `error`
  (payload ของแต่ละ event นิยามใน `03-technical-spec.md` §3.3–3.4; `chunk` = `{text}`, `status.status` ∈ `analyzing`, `retrieving`, `generating`, `verifying`; ลำดับท้ายสตรีม `citations → suggestions → complete → title_update`)
- CI-4: Web ↔ AI service: HTTP/1.1 ภายในเครือข่าย docker, header `X-Service-Token` (ค่าจาก `AI_SERVICE_TOKEN`), `X-LC-User` (JSON: user id/role/guest id/locale — ไม่มี PII), `X-Request-Id` สำหรับ tracing
- CI-5: Keep-alive ของ SSE: server ส่ง comment `: ping` ทุก 15 วินาที; proxy ปิด buffering (`X-Accel-Buffering: no`, `Cache-Control: no-cache, no-transform`, Caddy `flush_interval -1`)

---

## 5. Non-functional Requirements

### 5.1 NFR-PERF — Performance
| ID | ข้อกำหนด | เป้าหมาย | วิธีวัด |
|---|---|---|---|
| NFR-PERF-001 | TTFT ของแชท (ส่ง → chunk แรก) | p50 ≤ 1.5s, **p95 ≤ 3s** (ไม่รวมคิวเมื่อเกิน capacity) | APM + ตัวชี้วัดของ AI service | <br>**สถานะ (2026-09-30):** ~21 VUs p95 144 ms; 200 streams พร้อมกัน p95 3.48 s (เกิน 3 s เล็กน้อย) (spec §7.13 E)
| NFR-PERF-002 | Page load (LCP) หน้า content บน 4G จำลอง | ≤ 2.5s p75 | Lighthouse CI / RUM |
| NFR-PERF-003 | Search latency (`search`) | ≤ 800ms p95 | APM | <br>**สถานะ (2026-09-30):** ค้นหา p95 149 ms (~21 VUs), 695 ms (58 VUs) — ผ่าน
| NFR-PERF-004 | JSON API ทั่วไป | ≤ 300ms p95 | APM | <br>**สถานะ (2026-09-30):** API ทั่วไป p95 88 ms (~21 VUs) ผ่าน; **406 ms ที่ 58 VUs พร้อมกันบนเครื่องทดสอบที่ใช้ร่วม (ไม่ผ่าน)** — ต้องรันหลาย instance/แยกเครื่อง และวัดซ้ำบนเครื่อง production
| NFR-PERF-005 | Concurrent chat streams | 200 streams พร้อมกัน | load test (k6) | <br>**สถานะ (2026-09-30):** 200 streams พร้อมกันสำเร็จ 1,939/1,939 ไม่มีข้อผิดพลาด ; TTFT เกินเป้าเล็กน้อย
| NFR-PERF-006 | เวลาจบคำตอบ (complete) | p95 ≤ 30s | APM | <br>**สถานะ (2026-09-30):** แชทจบ p95 5.8 s (~21 VUs), 21.4 s (200 streams) — ผ่านเกณฑ์ 30 s
| NFR-PERF-007 | JS/CSS ขนาด (gzip) ที่โหลดครั้งแรก | ≤ 250KB (ไม่รวม lazy-load) | CI budget |
| NFR-PERF-008 | Reindex หลัง publish | ≤ 10 นาที | job metrics |
| NFR-PERF-009 | หน้า login/register/legal เรนเดอร์ฝั่ง server มี `<title>`/meta description ต่อหน้า, มี `sitemap.xml` + `robots.txt`; หน้าแชท/หลังบ้าน/แชร์ตั้ง `noindex` (หน้าคลังความรู้อยู่หลัง login จึงไม่ถูกจัดทำดัชนี) | `<title>` ครบทุกหน้า, หน้าที่ต้อง noindex ไม่ปรากฏใน sitemap | ตรวจใน `web/tests/screens.mjs` |

### 5.2 NFR-REL — Reliability & Availability
| ID | ข้อกำหนด | เป้าหมาย |
|---|---|---|
| NFR-REL-001 | Availability ของบริการเว็บ (ไม่รวม maintenance ที่แจ้งล่วงหน้า) | 99.5% ต่อเดือน |
| NFR-REL-002 | Backup DB | full รายวัน + WAL archiving; **RPO ≤ 24 ชม.** | <br>**สถานะ (2026-09-30):** บางส่วน: backup รายวันเข้ารหัสด้วย `scripts/backup.sh` (RPO = ช่วงห่างของ backup); ยังไม่มี WAL archiving และยังไม่ได้ติดตั้ง timer (ต้อง sudo)
| NFR-REL-003 | Restore | **RTO ≤ 4 ชม.**; ทดสอบ restore ทุกไตรมาส | <br>**สถานะ (2026-09-30):** บางส่วน: `scripts/restore-test.sh` กู้ลงฐานข้อมูลชั่วคราวและตรวจได้ใน ~10 วินาที (ข้อมูลทดสอบเล็ก); ยังไม่ได้ซ้อมกู้บนเครื่องอื่นและยังไม่ได้วัด RTO จริง
| NFR-REL-004 | Graceful degradation | เมื่อ AI service ไม่พร้อม: หน้าอ่านเนื้อหา (คลังความรู้/ตัวบท/คู่มือ) ยังใช้ได้, แชทแสดงข้อความ `unavailable` |
| NFR-REL-005 | Job retry | job ล้มเหลว retry แบบ exponential backoff สูงสุด 5 ครั้ง แล้วเข้า dead-letter + แจ้ง admin |

### 5.3 NFR-SEC — Security
| ID | ข้อกำหนด |
|---|---|
| NFR-SEC-001 | OWASP ASVS 4.0 Level 2 สำหรับ web tier; ผ่าน pentest ก่อนเปิด P1 | <br>**สถานะ (2026-09-30):** บางส่วน: ตรวจภายใน (audit dependency, gitleaks, ZAP baseline, e2e สิทธิ์) — **ยังไม่มี pentest โดยบุคคลที่สาม ซึ่งเกณฑ์กำหนดก่อนเปิด P1**
| NFR-SEC-002 | รหัสผ่านเก็บด้วย scrypt (ค่าเริ่มต้นของ Better Auth) ไม่เก็บรหัสผ่านเป็นข้อความธรรมดา |
| NFR-SEC-003 | Session cookie `lc.session_token` (Better Auth, cookie prefix `lc`, DB session ใน Postgres) `HttpOnly; Secure; SameSite=Lax`, ออก session ใหม่เมื่อ login/เปลี่ยนสิทธิ์; CSRF: ตรวจ Origin + token `X-CSRF-Token` |
| NFR-SEC-004 | Security headers: CSP (ไม่อนุญาต inline script ยกเว้น nonce/hash ที่กำหนด), HSTS, X-Content-Type-Options, X-Frame-Options SAMEORIGIN, Referrer-Policy, Permissions-Policy, COOP — อย่างน้อยเทียบเท่า AI-EDW |
| NFR-SEC-005 | SQL: prepared statements เท่านั้น; ไม่มี dynamic SQL จาก input |
| NFR-SEC-006 | บัญชี editor/reviewer/admin ต้องเปิด TOTP 2FA |
| NFR-SEC-007 | Rate limit: login 10/นาที/IP, API 120/นาที/ผู้ใช้, stream 3 พร้อมกัน/ผู้ใช้, share password 5 ครั้ง/15 นาที | <br>**สถานะ (2026-09-30):** ทำแล้ว: API 120/นาที/ผู้ใช้ (Redis), stream 3 พร้อมกัน, sign-in 10/นาที/IP, ล็อกรหัสผ่านลิงก์แชร์ต่อลิงก์ + เพิ่ม 20/นาที/IP; เพิ่มแชท 12/นาที (guest 6), อัปโหลด 6/นาที
| NFR-SEC-008 | Secrets ใน env/secret store เท่านั้น (ไม่มีใน git — ตรวจด้วย gitleaks); คีย์ของ API ภายนอก (ฐานความรู้ของบริษัท) อยู่เฉพาะ AI service |
| NFR-SEC-009 | Dependency scanning (pnpm audit, pip-audit) และ container scanning ใน CI; ไม่มีช่องโหว่ระดับ High/Critical ที่ยังไม่แก้ก่อน release | <br>**สถานะ (2026-09-30):** บางส่วน: `pnpm audit` (1 moderate ใน dev tooling), `pip-audit` (0), gitleaks (0) ผ่าน `scripts/security-scan.sh`; ยังไม่มี CI/container scanning
| NFR-SEC-012 | Tenant isolation: ทุกตารางที่เป็นขององค์กรมี `org_id`; ทุก query ผ่าน data-access layer ที่บังคับเงื่อนไข `org_id` + membership; ชุดทดสอบ cross-tenant อัตโนมัติผ่าน 100% ทุก PR; pentest ครอบคลุม IDOR ข้ามองค์กร |
| NFR-SEC-011 | ไฟล์อัปโหลด: ตรวจ MIME จริง (magic bytes), จำกัดขนาด, สแกนไวรัส, เก็บนอก web root, เสิร์ฟผ่าน signed URL |

### 5.4 NFR-PRIV — Privacy (PDPA)
| ID | ข้อกำหนด |
|---|---|
| NFR-PRIV-001 | มีประกาศความเป็นส่วนตัว (privacy notice) ภาษาไทย/อังกฤษ ระบุวัตถุประสงค์, ฐานทางกฎหมาย, ระยะเวลาเก็บ, ผู้รับข้อมูล (รวม API ฐานความรู้ของบริษัทเมื่อเปิดใช้), สิทธิเจ้าของข้อมูล, ช่องทางติดต่อ DPO |
| NFR-PRIV-002 | Consent แยกวัตถุประสงค์และถอนได้ (FR-AUTH-009/010); บันทึกหลักฐาน consent |
| NFR-PRIV-003 | ข้อมูลที่อาจเป็นข้อมูลอ่อนไหวที่ระบบเก็บ (ไฟล์สัญญาและข้อความที่สกัด — NFR-PRIV-009) เข้ารหัส (AES-256-GCM, envelope encryption, key แยกจาก DB) |
| NFR-PRIV-004 | PII masking ก่อนค้นหา บันทึก และส่งไป API ภายนอก (FR-AI-012); ไม่ส่ง user id/อีเมลไปยัง API ภายนอก |
| NFR-PRIV-005 | Data minimization: application log ไม่มีข้อความแชทดิบ/เนื้อหาคดี; analytics ใช้ข้อมูลแบบรวมหรือ pseudonymized |
| NFR-PRIV-006 | สิทธิเจ้าของข้อมูล: เข้าถึง/ขอสำเนา (FR-AUTH-017), ลบ (FR-AUTH-018), แก้ไข (โปรไฟล์), คัดค้าน/ถอน consent — ดำเนินการภายใน 30 วัน |
| NFR-PRIV-007 | Retention ตาม §6.2 และ job ลบอัตโนมัติที่ตรวจสอบได้ (log จำนวนที่ลบ) |
| NFR-PRIV-009 | ข้อมูลสัญญาขององค์กร: ไฟล์และข้อความที่สกัดเข้ารหัส (AES-256-GCM) แยก key ต่อองค์กรได้; เก็บตาม retention ขององค์กร (BR-024); ไม่ใช้นอกวัตถุประสงค์ของบริการ (FR-CR-010); มี DPA (องค์กร = ผู้ควบคุมข้อมูล, ผู้ให้บริการ = ผู้ประมวลผล) ก่อนเริ่มใช้งาน |
| NFR-PRIV-008 | มี data breach runbook: แจ้ง สคส. ภายใน 72 ชม. ตามหลักเกณฑ์ PDPA (ดู `03-technical-spec.md` §7) |

### 5.5 NFR-A11Y — Accessibility
| ID | ข้อกำหนด |
|---|---|
| NFR-A11Y-001 | สอดคล้อง **WCAG 2.2 ระดับ AA** ทุกหน้าผู้ใช้ปลายทาง |
| NFR-A11Y-002 | Contrast ข้อความปกติ ≥ 4.5:1, ข้อความใหญ่/ไอคอน ≥ 3:1 ทั้ง light และ dark | <br>**สถานะ (2026-09-30):** axe ไม่พบ contrast ผิดใน 124 ชุด (light/dark, ไทย/อังกฤษ, desktop/375px) หลังแก้ token
| NFR-A11Y-003 | ใช้งานด้วยคีย์บอร์ดได้ครบ, focus ring ชัดเจน, focus trap ใน modal/drawer, Esc ปิด |
| NFR-A11Y-004 | พื้นที่แชทเป็น `role="log" aria-live="polite"`; safety notice `role="alert"`; สถานะ stream ประกาศโดยไม่รบกวน (ไม่ประกาศทุก chunk) |
| NFR-A11Y-005 | Target size ≥ 24×24 CSS px (แนะนำ 44×44 บนมือถือ) |
| NFR-A11Y-006 | รองรับการขยายข้อความ 200% โดยไม่เสียการใช้งาน; ขนาดตัวอักษรเนื้อหาเริ่มต้น ≥ 16px |
| NFR-A11Y-007 | `prefers-reduced-motion` ปิด animation ที่ไม่จำเป็น |
| NFR-A11Y-008 | ทดสอบด้วย axe-core ใน CI (0 violations ระดับ serious/critical) + ทดสอบ manual ด้วย NVDA/VoiceOver ก่อน release ใหญ่ | <br>**สถานะ (2026-09-30):** axe ผ่าน (0 serious/critical) ด้วย `scripts/e2e-a11y.sh` — ยังไม่ได้รันใน CI (ไม่มี CI) และยังไม่ได้ทดสอบ screen reader

### 5.6 NFR-I18N — Internationalization
| ID | ข้อกำหนด |
|---|---|
| NFR-I18N-001 | รองรับ `th` (ค่าเริ่มต้น) และ `en` ครบทุกข้อความ UI |
| NFR-I18N-002 | ข้อความ UI อยู่ใน `web/messages/<locale>.json` ใช้ผ่าน next-intl (Server และ Client Components); ชุดทดสอบ Vitest (`web/tests/unit/i18n.test.ts`) ตรวจว่า key ของ th/en ตรงกันและข้อความอังกฤษไม่มีอักษรไทย |
| NFR-I18N-003 | วันที่: เก็บ UTC, แสดงเขตเวลา Asia/Bangkok, locale th ใช้ปี พ.ศ. (เช่น "24 ก.ย. 2569") |
| NFR-I18N-004 | การเรียงลำดับข้อความไทยใช้ collation ไทย (ICU `th-TH`) |
| NFR-I18N-005 | รองรับ input เลขไทย (๐–๙) ในการค้นหาและฟอร์มตัวเลข |
| NFR-I18N-006 | เนื้อหาคลังความรู้ P1 เป็นภาษาไทย; เนื้อหาที่ไม่มีคำแปลแสดงภาษาไทยพร้อมป้าย "ยังไม่มีฉบับแปล" |

### 5.7 NFR-USAB — Usability
| ID | ข้อกำหนด |
|---|---|
| NFR-USAB-001 | ผู้ใช้ใหม่ถามคำถามแรกได้ภายใน 30 วินาทีจากการเข้าเว็บ (guest, usability test ≥ 80% สำเร็จ) |
| NFR-USAB-002 | เนื้อหาระดับ "พื้นฐาน" ใช้ภาษาไทยง่าย: ประโยคสั้น, ศัพท์กฎหมายต้องอธิบายหรือมี tooltip; ตรวจโดย checklist ของ editor/reviewer |
| NFR-USAB-003 | ทุก flow หลัก (J1–J4 ใน blueprint) ผ่าน usability test กับผู้ใช้จริง ≥ 5 คน/flow ก่อนเปิด phase ที่เกี่ยวข้อง, SUS ≥ 70 |
| NFR-USAB-004 | ข้อความปุ่ม/เมนูเป็นคำกริยาที่ชัดเจน ไม่ใช้ศัพท์เทคนิค |
| NFR-USAB-005 | ไม่มีการกระทำที่ทำลายข้อมูลโดยไม่ confirm; การลบแชท โฟลเดอร์ สัญญา และบัญชีผ่าน dialog ยืนยัน |

### 5.8 NFR-OBS — Observability
| ID | ข้อกำหนด |
|---|---|
| NFR-OBS-001 | Structured JSON logs ทุก service พร้อม `request_id`, `user_id` (pseudonymized), `chat_id`, latency, status — **ไม่มีข้อความแชทดิบ/เนื้อหาคดี/PII** |
| NFR-OBS-002 | Metrics (Prometheus) ของ web และ AI service: จำนวนและความหน่วงของคำขอ, อัตรา error, คำขอที่ถูกจำกัดด้วย rate limit/quota, สถานะ kill switch, หน่วยความจำ |
| NFR-OBS-003 | สืบย้อนคำขอ web → ai ด้วย `X-Request-Id` ที่อยู่ใน log ทุก service |
| NFR-OBS-004 | Alerting ตาม `deploy/monitoring/alerts.yml`: web/AI service ล่ม, API 5xx > 5%, API p95 > 2s, แชทถูกปฏิเสธด้วย rate limit/quota จำนวนมาก, kill switch เปิด, หน่วยความจำ web สูง, AI 5xx |
| NFR-OBS-005 | Log retention 30 วัน (app logs), 1 ปี (audit log) |

### 5.9 NFR-MAINT — Maintainability
| ID | ข้อกำหนด |
|---|---|
| NFR-MAINT-001 | Unit test coverage: TypeScript `web/lib`, `web/app/api` ≥ 70% (Vitest), Python `ai/app/rag`, `guardrails` ≥ 80% |
| NFR-MAINT-002 | Lint/format ผ่านใน CI: ESLint + Prettier + `tsc --noEmit` (strict); ruff + mypy; Drizzle schema ต้องตรงกับ SQL migrations (`drizzle-kit pull` ไม่มี diff) |
| NFR-MAINT-003 | DB migration แบบ forward-only, ตั้งชื่อ `NNNN_description.sql`, รันซ้ำได้อย่างปลอดภัย |
| NFR-MAINT-004 | เอกสาร `docs/` อัปเดตใน PR เดียวกับการเปลี่ยนสเปก (Definition of Done) |
| NFR-MAINT-005 | Config ทั้งหมดผ่าน env (`.env.example` ครบทุกตัวแปรพร้อมคำอธิบาย) |
| NFR-MAINT-006 | ตัวเลข/กฎทางกฎหมายเป็นข้อมูล (data-driven) ไม่ hard-code ในโค้ด |

### 5.10 NFR-COST — Cost / Quota
| ID | ข้อกำหนด |
|---|---|
| NFR-COST-003 | Quota ต่อ role (BR-001), quota ต่อองค์กร (BR-023) และ rate limit (NFR-SEC-007); ผู้ดูแลระบบหยุดแชท/การอัปโหลดฉุกเฉินได้ด้วย kill switch (FR-ADM-024) |

### 5.11 NFR-LEGAL — Legal Content Quality & Compliance
| ID | ข้อกำหนด | เป้าหมาย |
|---|---|---|
| NFR-LEGAL-001 | อัตราการอ้างมาตรา/กฎหมายที่ไม่มีจริงหรือไม่ตรงกับคลังความรู้ ในคำตอบที่ผู้ใช้เห็น | ≤ 0.5% (ชุดทดสอบ + สุ่มตรวจ production รายเดือน ≥ 200 คำตอบ) |
| NFR-LEGAL-002 | Citation accuracy | ≥ 95% |
| NFR-LEGAL-003 | Disclaimer แสดงในทุกคำตอบของแชท, ทุกเอกสารที่สร้าง, footer ทุกหน้า | 100% |
| NFR-LEGAL-004 | เนื้อหาที่ publish ผ่าน reviewer ที่ไม่ใช่ผู้เขียน | 100% |
| NFR-LEGAL-005 | รอบทบทวนเนื้อหา (BR-008); สัดส่วนเนื้อหาที่เลยรอบทบทวน | ≤ 5% |
| NFR-LEGAL-006 | ตัวบทใหม่/แก้ไขที่ประกาศในราชกิจจานุเบกษา (ในขอบเขตกฎหมายที่มีในคลังความรู้) ถูกนำเข้า | ภายใน 14 วันหลังประกาศ |
| NFR-LEGAL-007 | ไม่มีฟีเจอร์ที่เป็นการว่าความ/ร่างคำคู่ความแทนผู้ใช้ (FR-TPL-009) | ตรวจทุก release โดยที่ปรึกษากฎหมาย |
| NFR-LEGAL-008 | Safety triage recall (FR-AI-009) | ≥ 0.98 (เป้าหมาย 1.00; smoke set ต้อง = 1.00 — ตาม `03-technical-spec.md` §4.1, §4.10) |

---

## 6. Data Requirements

### 6.1 Key Entities (รายละเอียด/DDL ใน `03-technical-spec.md` §2)
| กลุ่ม | ตาราง |
|---|---|
| ผู้ใช้และสิทธิ์ | `app.users`, `app.sessions`, `app.accounts`, `app.verifications`, `app.two_factors` (ตาราง Better Auth), `app.user_settings`, `app.user_consents`, `app.dsr_requests`, `app.usage_counters`, `app.audit_log` |
| แชท | `app.chats`, `app.chat_folders`, `app.messages`, `app.message_citations`, `app.message_feedback`, `app.chat_shares` |
| ที่บันทึกไว้/ความก้าวหน้า | `app.bookmarks`, `app.guide_progress` |
| องค์กรและสัญญา | `app.organizations`, `app.members`, `app.invitations`, `app.org_settings` (Better Auth `organization` plugin + ค่าองค์กร), `app.counsel_shares`, `app.contracts`, `app.contract_reviews`; `org_id` บน `app.chats`, `app.chat_folders`, `app.bookmarks`, `app.usage_counters` |
| ระบบ/ปฏิบัติการ | `app.jobs`, `app.guardrail_events`, `app.retrieval_logs`, `app.system_settings` |
| ความรู้ | `kb.categories`, `kb.laws`, `kb.law_versions`, `kb.law_sections`, `kb.articles`, `kb.article_versions`, `kb.guides`, `kb.templates`, `kb.glossary_terms`, `kb.synonyms` |
| Retrieval/คุณภาพ | `kb.chunks`, `kb.content_reviews` |
| ไม่ได้ใช้งาน | ตารางที่สร้างไว้แต่ไม่มีหน้าจอหรือ API ใดใช้ (คงไว้เพราะ migration เป็น forward-only): `kb.courses`, `kb.lessons`, `kb.quiz_questions`, `kb.help_agencies`, `kb.courts`, `kb.prescription_rules`, `kb.prompt_versions`, `kb.eval_cases`, `kb.eval_runs`, `kb.review_rules`, `app.learning_progress`, `app.llm_calls` — รายการเต็มใน `03-technical-spec.md` §2.4 |

### 6.2 Retention
| ข้อมูล | ระยะเก็บ | หมายเหตุ |
|---|---|---|
| แชทของ guest | 24 ชม. หลังใช้งานล่าสุด | ลบถาวรโดย job |
| แชทของ member | จนกว่าผู้ใช้ลบ; soft-delete แล้วลบถาวรใน 30 วัน | |
| ไฟล์ที่สร้างจากแบบหนังสือ | ไม่เก็บ | สร้างแล้วส่งให้ผู้ใช้ทันที; ข้อมูลที่กรอกอยู่ในเบราว์เซอร์ของผู้ใช้เท่านั้น |
| ลิงก์แชร์ | ตามวันหมดอายุ (BR-004) | revoke เมื่อแชทถูกลบ |
| Feedback + บทสนทนาที่ผู้ใช้อนุญาต | 2 ปี (pseudonymized) | ใช้ปรับปรุงคุณภาพ |
| `app.guardrail_events` | 1 ปี | ไม่มีข้อความดิบ (guardrail เก็บข้อความ masked ≤ 90 วัน) |
| `app.retrieval_logs` | 90 วัน | เก็บเฉพาะ query ที่ rewrite แล้วและผ่าน PII masking |
| `app.dsr_requests` | 3 ปีหลังปิดคำขอ | หลักฐานการปฏิบัติตาม PDPA |
| Audit log | 1 ปี (append-only) | pseudonymize เมื่อบัญชีถูกลบ |
| Application logs | 30 วัน | |
| Backup | รายวัน 14 ชุด + รายสัปดาห์ 8 ชุด (`BACKUP_KEEP_DAILY`, `BACKUP_KEEP_WEEKLY` ใน `scripts/backup.sh`) | ข้อมูลที่ถูกลบจะหายจาก backup ตามรอบ |
| บัญชีที่ขอลบ | ช่วงผ่อนผัน 30 วัน แล้วลบถาวร (BR-012) | |
| ไฟล์สัญญา + ข้อความที่สกัด (M12) | ตาม retention ขององค์กร ค่าเริ่มต้น 180 วัน (BR-024) | เข้ารหัส; ไม่ใช้นอกวัตถุประสงค์ของบริการ |
| ข้อมูลองค์กรเมื่อองค์กรถูกลบ | ≤ 30 วัน | job ลบตรวจสอบได้ |
| Audit log องค์กร | 1 ปี (append-only) | ไม่มีเนื้อหาสัญญา/แชท |

> สถานะ (2026-10-01): job ที่ลบอัตโนมัติจริงตามระยะข้างต้น คือ แชท guest, ข้อมูลที่ผู้ใช้ลบ (soft-delete 30 วัน), ลิงก์แชร์ที่หมดอายุ, บัญชีและองค์กรที่ขอลบ, สัญญาตาม retention, session/token ที่หมดอายุ; ส่วน `app.guardrail_events`, `app.retrieval_logs`, `app.audit_log`, `app.dsr_requests` และ `app.jobs` ยังไม่มี job ลบตามระยะที่ระบุ (ระยะเหล่านี้เป็นข้อกำหนดนโยบาย)

### 6.3 Data Quality
- ตัวบท: 1 มาตรา = 1 แถวต่อเวอร์ชัน; ข้อความต้องตรงกับต้นฉบับทางการ (ตรวจโดย reviewer) — ห้ามแก้ถ้อยคำตัวบทเพื่อ "อ่านง่าย" (ให้ทำในบทความแทน)
- เนื้อหาทุกชิ้นมี `category_code` อย่างน้อย 1 หมวดจาก taxonomy

---

## 7. Business Rules

| ID | กฎ |
|---|---|
| BR-001 | **Quota ข้อความแชทต่อวัน** (ตั้งด้วย env `GUEST_DAILY_MESSAGES` / `MEMBER_DAILY_MESSAGES`; staff คงที่ 300; นับใน `app.usage_counters`): guest 10, member 100, editor/reviewer/admin 300; รีเซ็ต 00:00 Asia/Bangkok; regenerate นับ 1; ข้อความที่ล้มเหลวจากฝั่งระบบไม่นับ |
| BR-002 | ความยาวข้อความผู้ใช้สูงสุด 4,000 อักษร |
| BR-003 | แชทของ guest ถูกลบถาวรเมื่อไม่มีการใช้งาน 24 ชม. |
| BR-004 | ลิงก์แชร์: หมดอายุค่าเริ่มต้น 30 วัน, สูงสุด 365 วัน; รหัสผ่านไม่บังคับ (ถ้าตั้ง ≥ 6 อักษร); ผู้ใช้ 1 คนมีลิงก์ active ได้ ≤ 50 |
| BR-005 | Disclaimer: (ก) footer ทุกหน้า (ข) ท้ายทุกคำตอบเชิงกฎหมาย (ค) ทุกเอกสารที่สร้าง — ข้อความมาตรฐานมาจาก i18n และแก้ได้เฉพาะ admin + reviewer |
| BR-006 | **Safety escalation categories** (ตาม `03-technical-spec.md` §0.2): `domestic_violence` (รวมความรุนแรงทางเพศ), `child_abuse` (รวมการค้ามนุษย์ที่เกี่ยวกับเด็ก), `self_harm`, `threat_violence` (ถูกขู่/อันตรายต่อชีวิต รวมการค้ามนุษย์), `arrest_detention`, `scam_in_progress` (กำลังถูกหลอกโอนเงิน), `deadline_imminent` (เรื่องที่มีกำหนดเวลาใกล้ถึง เช่น วันนัดศาล หมายเรียก อายุความ) — ระดับ `urgent` หรือ `caution`; จัดระดับด้วยชุดคำสำคัญ และหมายเลขติดต่อต้องมาจากข้อมูลที่ตรวจยืนยันแล้วเท่านั้น (ปัจจุบันยังไม่มี) |
| BR-007 | **Content lifecycle**: `draft → in_review → published → archived`; การตีกลับ = review action `requested_changes` → กลับเป็น `draft` แล้วส่ง `in_review` ใหม่ได้ (วนได้หลายรอบ); ผู้อนุมัติ ≠ ผู้ส่งเข้าตรวจล่าสุด; published แก้ตรงไม่ได้ (สร้าง draft เวอร์ชันใหม่) |
| BR-008 | **รอบทบทวน** (`review_due_at`): เนื้อหา (บทความ/คู่มือ/แบบหนังสือ) ที่อ้างมาตราซึ่งถูกแก้ไขต้องถูกตั้ง `review_due_at` ทันทีเมื่อตัวบทฉบับใหม่ได้รับอนุมัติ (FR-ADM-009) |
| BR-009 | **การเลือกเวอร์ชันตัวบท**: ใช้เวอร์ชันที่ `effective_from ≤ วันที่อ้างอิง (as_of, ค่าเริ่มต้น = วันนี้) < effective_to`; ห้ามลบเวอร์ชันเก่า ให้ปิดวันแทน |
| BR-010 | Citation อ้างได้เฉพาะ: มาตราในตัวบทที่มีในคลัง และบทความ/คู่มือ/คำศัพท์ในคลัง (published; ฉบับร่างเฉพาะระบบทดสอบและติดป้ายฉบับร่าง) |
| BR-012 | ลบบัญชี: `pending_deletion` 30 วัน (login เพื่อยกเลิกได้) → ลบถาวร; audit log เก็บแบบ pseudonymized จนครบ 1 ปี |
| BR-013 | ชื่อแชท: ตั้งอัตโนมัติ 1 ครั้งหลังคำตอบแรก, ≤ 60 อักษร, ไม่มี PII; ถ้าผู้ใช้เปลี่ยนชื่อเอง ตั้ง `app.chats.title_source = 'user'` และระบบจะไม่เขียนทับ |
| BR-014 | เหตุผล 👎 (enum `app.feedback_reason`): `incorrect` (ข้อมูลผิด), `incomplete` (ไม่ครบ), `hard_to_understand` (เข้าใจยาก), `off_topic` (ไม่ตรงคำถาม), `outdated` (ล้าสมัย), `missing_citation` (ไม่มี/อ้างอิงไม่ตรง), `unsafe` (ไม่ปลอดภัย/ไม่เหมาะสม), `other` |
| BR-016 | รหัสผ่าน ≥ 10 อักษร; login ผิด 5 ครั้งใน 15 นาที → ล็อก 15 นาที (`LOCKOUT_MAX_FAILURES`, `LOCKOUT_MINUTES`) |
| BR-017 | Session idle timeout 60 นาที (`SESSION_LIFETIME_MIN`, นับถอยหลังที่ footer); "จดจำฉัน" 30 วัน (`SESSION_REMEMBER_DAYS`) — ไม่ใช้กับ role editor/reviewer/admin (session หมดเมื่อปิดเบราว์เซอร์) |
| BR-020 | ตัวเลขทางกฎหมาย (ค่าธรรมเนียม, เกณฑ์ทุนทรัพย์, อายุความ, อัตราดอกเบี้ย, อัตราโทษ, ระยะเวลาตามกฎหมาย) ต้องมาจากเนื้อหาในคลังความรู้พร้อม citation และ as-of date เท่านั้น — ระบบห้ามสร้างตัวเลขเหล่านี้เอง |
| BR-021 | Stream พร้อมกันต่อผู้ใช้ ≤ 3 (รวม guest) |
| BR-022 | Next-step card ต้องชี้ไปเนื้อหาที่มีอยู่ในคลังเท่านั้น; หมายเลขติดต่อใน safety notice ต้องมาจากข้อมูลที่ตรวจยืนยันแล้ว |
| BR-023 | **Quota องค์กร (ค่าเริ่มต้นช่วง pilot)**: แชท 300 ข้อความ/สมาชิก/วัน, สมาชิก ≤ 20 คน/องค์กร (รวมคำเชิญที่ค้าง) — admin override ได้ใน `app.org_settings`; นับใน `app.usage_counters` (มี `org_id`) |
| BR-024 | **Retention สัญญา**: ค่าเริ่มต้น 180 วันหลังอัปโหลด (ตั้งได้ 30/90/180/365 วัน หรือจนกว่าจะลบ); ลบองค์กร → ลบข้อมูลองค์กรทั้งหมดภายใน 30 วัน |
| BR-025 | **ขีดจำกัดสัญญา**: PDF/DOCX เท่านั้น, ≤ 20 MB, ≤ 50 หน้า; ไม่รองรับไฟล์สแกนเป็นภาพ |
| BR-026 | **เมื่อสมาชิกออกจากองค์กร**: ข้อมูลที่สร้างในบริบทองค์กรเป็นขององค์กร — โอนความเป็นเจ้าของให้ `org_owner`; ข้อมูลในพื้นที่ส่วนตัวยังเป็นของผู้ใช้ |
| BR-027 | ข้อความในระบบห้ามอ้างว่าเนื้อหา/ผลตรวจผ่านการตรวจหรือรับรองโดยบุคคลหรือหน่วยงานใด เว้นแต่มีบันทึกการ approve จริงใน `kb.content_reviews` |

---

## 8. Traceability Matrix

### 8.1 Requirement Prefix → Module → Routes → API operationIds → Tables
Routes คือหน้าใน Next.js App Router; operationId คือชื่อ endpoint (Route Handler ใต้ `/api/v1`) — method + path ของแต่ละ operationId อยู่ใน `03-technical-spec.md` §3

| Prefix | Module | Routes | API operationIds / Stream | Tables |
|---|---|---|---|---|
| FR-AUTH | M1 | `/login`, `/register`, `/forgot-password`*, `/reset-password`, `/two-factor`, `/consent`, `/settings`, `/legal/[doc]` | Better Auth (`/api/auth/*`: สมัคร, ยืนยันอีเมล, login, logout, ลืม/ตั้งรหัสผ่าน, guest, 2FA), `check_session`, `get_settings`, `update_settings`, `get_consents`, `record_consent`, `privacy_export`, `request_account_deletion`, `cancel_account_deletion` | `app.users`, `app.sessions`, `app.accounts`, `app.verifications`, `app.two_factors`, `app.user_settings`, `app.user_consents`, `app.dsr_requests`, `app.usage_counters`, `app.system_settings`, `app.audit_log`, `app.jobs` |
| FR-CHAT | M2 | `/chat`, `/chat/[chatId]`, `/saved`, `/share/[token]`, `/print/[chatId]` | `get_chat_history`, `get_chat`, `update_chat`, `delete_chat`, `create_chat_folder`, `update_chat_folder`, `delete_chat_folder`, `send_feedback`, `remove_feedback`, `create_chat_share`, `list_chat_shares`, `revoke_chat_share`, `get_saved`, `add_bookmark`, `update_bookmark`, `delete_bookmark`, `remove_bookmark_by_item`, `get_glossary_tips` · **stream**: `POST /api/v1/chat/stream` (`chat_stream`) | `app.chats`, `app.chat_folders`, `app.messages`, `app.message_citations`, `app.message_feedback`, `app.chat_shares`, `app.bookmarks`, `app.usage_counters` |
| FR-AI | M2 (AI service) | — (ผ่าน stream) | AI service: `POST /v1/chat/stream`, `POST /v1/kb/search` (สเปกใน `03-technical-spec.md` §3.5) | `kb.chunks`, `kb.law_sections`, `kb.glossary_terms`, `app.chats`, `app.messages` (`verification`, `verification_status`), `app.message_citations`, `app.retrieval_logs`, `app.guardrail_events`, `app.usage_counters`, `app.system_settings` |
| FR-KB | M3 | `/library`, `/library/[category]`, `/library/articles/[slug]`, `/library/search`, `/library/glossary[/term]`, `/law`, `/law/[code]` | `get_glossary_tips`, `add_bookmark` (ค้นหา: `POST /v1/kb/search` ของ AI service) | `kb.categories`, `kb.articles`, `kb.article_versions`, `kb.laws`, `kb.law_versions`, `kb.law_sections`, `kb.glossary_terms`, `kb.chunks`, `app.bookmarks` |
| FR-GUIDE | M5 | `/guides/[slug]` (เปิดจากลิงก์อ้างอิง/ขั้นตอนถัดไป/ที่บันทึกไว้; `/guides` ไม่มีลิงก์ไป) | `get_guide_progress`, `update_guide_progress` | `kb.guides`, `app.guide_progress` |
| FR-TPL | M6 | `/templates`, `/templates/[slug]` | `render_template` | `kb.templates` |
| FR-ORG | M11 | `/org/new`, `/org/settings`, `/org/usage`, `/org/audit`, `/org/counsel`, `/accept-invitation`, org switcher ใน sidebar | `get_org`, `update_org`, `get_org_usage`, `get_org_audit`, `leave_org`, `request_org_deletion`, `cancel_org_deletion`, `share_to_counsel`, `list_counsel_shares`, `get_counsel_share`, `reply_counsel_share`; สมาชิก/คำเชิญผ่าน Better Auth `organization` plugin | `app.organizations`, `app.members`, `app.invitations`, `app.org_settings`, `app.counsel_shares`, `app.usage_counters`, `app.audit_log`, `org_id` บนตาราง app ที่เกี่ยวข้อง |
| FR-CR | M12 | `/contracts`, `/contracts/[id]` | `upload_contract`, `list_contracts`, `get_contract`, `update_contract`, `delete_contract`, `get_contract_review`, `start_contract_review` | `app.contracts`, `app.contract_reviews`, `app.jobs` |
| FR-ADM | M10 | `/admin`, `/admin/(review\|content\|laws\|feedback\|guardrails\|users\|audit\|dsr\|usage\|announcement\|orgs\|system)` | `admin_list_content`, `admin_get_content`, `admin_save_content`, `admin_revise_content`, `admin_submit_review`, `admin_review_decision`, `admin_archive_content`, `admin_search_sections`, `admin_import_law`, `admin_get_law_import`, `admin_commit_law_import`, `admin_list_laws`, `admin_list_feedback`, `admin_get_feedback`, `admin_update_feedback`, `admin_list_guardrails`, `admin_mark_guardrail`, `admin_list_users`, `admin_update_user`, `admin_audit_log`, `admin_list_dsr`, `admin_create_dsr`, `admin_update_dsr`, `admin_usage`, `admin_get_announcement`, `admin_set_announcement`, `admin_clear_announcement`, `admin_update_org_quota`, `admin_get_system`, `admin_set_kill_switch` | `kb.*` + `kb.content_reviews`, `app.message_feedback`, `app.guardrail_events`, `app.retrieval_logs`, `app.users`, `app.dsr_requests`, `app.system_settings`, `app.audit_log`, `app.jobs` |

\* `/forgot-password` และฟอร์มเชิญสมาชิกองค์กรแสดงเฉพาะเมื่อ `env.mailLive` เป็นจริง (`MAIL_LIVE=true` หรือ `SMTP_HOST` ไม่ใช่เครื่องนี้/mailpit)

### 8.2 Journey → Requirements
| Journey (blueprint §3) | Requirements หลัก |
|---|---|
| J1 Problem → Action | FR-CHAT-001–011, FR-CHAT-013–016, FR-AI-001–004, FR-AI-006, FR-AI-009, FR-AI-012, FR-AI-017 |
| J3 ทำนิติกรรม | FR-GUIDE-001–008, FR-TPL-001–008 |
| J5 Editorial | FR-ADM-002–005, FR-ADM-007–009, FR-ADM-021 |
| J6 Feedback loop | FR-CHAT-016, FR-KB-016, FR-ADM-011 |
| J7 สัญญาขององค์กร (รับ/อ่าน/แยกข้อ/ตรวจ) | FR-CR-001–002, FR-CR-009, FR-CR-011, FR-CR-012, FR-ORG-005, FR-ORG-010 |

### 8.3 Non-negotiables (CLAUDE.md §2) → Requirements
| กฎเหล็ก | Requirements |
|---|---|
| 1 ข้อมูลทั่วไป ไม่ใช่ว่าความ | FR-TPL-009, FR-AI-017, NFR-LEGAL-007 |
| 2 ห้ามแต่งมาตรา/ตัวเลข | FR-AI-002, FR-AI-003, FR-AI-004, FR-AI-006, BR-020, NFR-LEGAL-001 |
| 3 citation + as-of + disclaimer | FR-CHAT-009, FR-AI-008, BR-005 |
| 4 reviewer ก่อน publish | FR-ADM-004, BR-007, NFR-LEGAL-004 |
| 5 เรื่องเร่งด่วน | FR-AI-009, FR-CHAT-031, BR-006 |
| 6 versioning ตัวบท | FR-AI-013, FR-ADM-009, BR-009 |
| 7 PDPA ข้อมูลอ่อนไหว | FR-AUTH-009, FR-AI-012, NFR-PRIV-003, NFR-PRIV-009 |
| 8 ไม่ log ข้อความดิบ | NFR-OBS-001, NFR-PRIV-005 |
| 11 session + CSRF + ownership | FR-AUTH-022, NFR-SEC-003 |
| 12 sanitize output | FR-CHAT-008 |
| 13 i18n | FR-AUTH-013, NFR-I18N-002 |
| ข้อความต้องเป็นจริงและมีแหล่งอ้างอิง | BR-027, FR-KB-016, BR-010 |
| แยกข้อมูลองค์กร | FR-ORG-006, NFR-SEC-012, NFR-PRIV-009 |

---

## 9. Appendix — อภิธานศัพท์กฎหมายที่ใช้ใน UI
> คำอธิบายสำหรับทีมพัฒนาเพื่อใช้ label ให้สอดคล้องกัน (เนื้อหาอภิธานศัพท์สำหรับผู้ใช้จริงอยู่ใน `kb.glossary_terms` และต้องผ่าน reviewer)

| คำไทย (label UI) | English (label UI) | ความหมายโดยย่อ |
|---|---|---|
| ตัวบทกฎหมาย | Legal text / Statute | ถ้อยคำของกฎหมายตามที่ประกาศ |
| มาตรา | Section | หน่วยย่อยของตัวบท |
| บรรพ / ลักษณะ / หมวด / ส่วน | Book / Title / Chapter / Part | ลำดับชั้นโครงสร้างของประมวลกฎหมาย |
| ประมวลกฎหมาย | Code | กฎหมายที่รวบรวมเป็นระบบ เช่น ป.พ.พ., ป.อ. |
| พระราชบัญญัติ (พ.ร.บ.) | Act | กฎหมายที่ตราโดยฝ่ายนิติบัญญัติ |
| กฎกระทรวง / ระเบียบ / ประกาศ | Ministerial Regulation / Rule / Notification | กฎหมายลำดับรอง |
| ราชกิจจานุเบกษา | Royal Gazette | สื่อทางการที่ประกาศกฎหมาย |
| มีผลใช้บังคับ | In force / Effective | วันที่กฎหมายเริ่มใช้ |
| ยกเลิก | Repealed | กฎหมาย/มาตราที่ไม่มีผลแล้ว |
| คำพิพากษาศาลฎีกา (ฎีกา) | Supreme Court judgment | คำวินิจฉัยของศาลฎีกา |
| นิติกรรม | Juristic act | การกระทำที่มุ่งก่อผลทางกฎหมาย |
| สัญญา | Contract | นิติกรรมสองฝ่ายขึ้นไป |
| โมฆะ / โมฆียะ | Void / Voidable | นิติกรรมที่เสียเปล่า / ที่อาจถูกบอกล้าง |
| ละเมิด | Tort / Wrongful act | การทำให้ผู้อื่นเสียหายโดยผิดกฎหมาย |
| อายุความ | Prescription (limitation period) | ระยะเวลาใช้สิทธิเรียกร้องทางศาล |
| ภูมิลำเนา | Domicile | ถิ่นที่อยู่อันเป็นแหล่งสำคัญ ใช้กำหนดเขตอำนาจศาล |
| เขตอำนาจศาล | Jurisdiction | ศาลที่มีอำนาจรับคดี |
| ทุนทรัพย์ | Amount in dispute | มูลค่าที่พิพาทในคดีแพ่ง |
| ค่าธรรมเนียมศาล | Court fee | เงินที่ต้องชำระเมื่อยื่นฟ้อง/คำร้อง |
| โจทก์ / จำเลย | Plaintiff / Defendant | ผู้ฟ้อง / ผู้ถูกฟ้อง |
| ผู้เสียหาย / ผู้ต้องหา | Injured person / Suspect (alleged offender) | ในคดีอาญา |
| คำฟ้อง / คำให้การ | Complaint (plaint) / Answer (statement of defence) | คำคู่ความหลักในคดีแพ่ง |
| คดีมโนสาเร่ | Small claims case | คดีแพ่งที่มีกระบวนพิจารณาแบบง่าย (เกณฑ์เป็น reference data) |
| คดีผู้บริโภค | Consumer case | คดีตามกฎหมายวิธีพิจารณาคดีผู้บริโภค |
| ไกล่เกลี่ย | Mediation | การระงับข้อพิพาทโดยคนกลาง |
| บังคับคดี | Enforcement of judgment | การบังคับตามคำพิพากษา เช่น ยึด อายัด |
| อุทธรณ์ / ฎีกา (การยื่น) | Appeal / Appeal to the Supreme Court | การโต้แย้งคำพิพากษาต่อศาลสูงขึ้น |
| ผู้จัดการมรดก | Estate administrator | ผู้มีหน้าที่จัดการกองมรดก |
| ทายาทโดยธรรม | Statutory heir | ทายาทตามลำดับที่กฎหมายกำหนด |
| พินัยกรรม | Will | คำสั่งเกี่ยวกับทรัพย์สินที่มีผลเมื่อตาย |
| สินสมรส / สินส่วนตัว | Marital property / Personal property | ทรัพย์สินระหว่างสามีภริยา |
| ค่าชดเชย | Severance pay | เงินที่นายจ้างจ่ายเมื่อเลิกจ้าง (อัตราเป็น reference data) |
| ความช่วยเหลือทางกฎหมาย | Legal aid | บริการทนาย/คำปรึกษาฟรีหรือราคาต่ำ |

---

## 10. Change Log
| เวอร์ชัน | วันที่ | ผู้แก้ไข | รายละเอียด |
|---|---|---|---|
| 1.0 | 2026-09-24 | ทีมออกแบบ (AI-assisted) | Baseline แรก |
| 1.1 | 2026-09-24 | ทีมออกแบบ (AI-assisted) | ปรับชื่อให้ตรง naming registry และ action catalogue (ปัจจุบันอยู่ใน `03-technical-spec.md` §0.2, §3.2) (action, ตาราง, consent purpose, SSE payload, enum); เพิ่ม FR-AUTH-023 (text scale), FR-AUTH-024 (DSR), FR-AUTH-025 (TOTP staff), FR-ADM-023 (DSR queue) |
| 1.2 | 2026-09-24 | ทีมออกแบบ (AI-assisted) | ยุบเอกสารเทคนิคเดิม 9 ไฟล์รวมเป็น `03-technical-spec.md`; อัปเดตการอ้างอิงทั้งหมด |
| 1.3 | 2026-09-24 | ทีมออกแบบ (AI-assisted) | ย้าย web tier จาก PHP + Vanilla JS เป็น Next.js (App Router, TypeScript): หน้า `*.html` → routes, `api.html?action=` → operationId ของ Route Handlers `/api/v1`, SSE → `POST /api/v1/chat/stream`, auth → Better Auth (`anonymous`, `twoFactor`; ตาราง `app.sessions/accounts/verifications/two_factors` แทน `app.auth_tokens`/`totp_secret_enc`); เพิ่ม NFR-PERF-009 (SEO), สรุปผลตรวจ server + A6 (การนำเข้าตัวบทแบบ manual); ไม่เปลี่ยนความหมาย/ID ของ FR |
| 1.4 | 2026-09-29 | ทีมออกแบบ (AI-assisted) | ปรับทิศทาง: องค์กรก่อน + กฎหมายสัญญาก่อน — ขอบเขต §1.2, user classes, A1/A4/A7/A8; เพิ่ม FR-ORG-001–012 (M11) และ FR-CR-001–014 (M12), NFR-PERF-010, NFR-SEC-012, NFR-PRIV-009, BR-023–027; traceability + retention สำหรับองค์กรและสัญญา |
| 1.5 | 2026-10-01 | ทีมออกแบบ (AI-assisted) | ปรับเอกสารให้ตรงกับระบบจริง: คำตอบมาจากเครื่องตอบ extractive ของคลังความรู้ + ตัวเสริมฐานความรู้ของบริษัทที่ติดป้ายกำกับ; ตัดข้อกำหนดของโมดูลที่ไม่ได้สร้าง (M4, M7, M8, M9) และฟีเจอร์ที่ไม่มี; M12 เหลือเฉพาะรับไฟล์/อ่าน/แยกข้อ/ลบ; เพิ่ม FR-ADM-024 (kill switch); ID ของข้อกำหนดที่คงอยู่ไม่เปลี่ยน (เลขที่ขาดหายคือข้อที่ถูกตัด) |
| 1.6 | 2026-10-01 | ทีมออกแบบ (AI-assisted) | ปรับให้ตรงโค้ด: เมนูหลักไม่มี "คู่มือขั้นตอน" (FR-GUIDE-001, 007; FR-KB-002, 009); M12 เพิ่มการตรวจสัญญารายข้อ (FR-CR-011 — ตัวตรวจ `off`/`mock`/`http`, ผลจำลองติดป้าย, โควตา/rate limit/kill switch); FR-ADM-011 ปรับรายการ root cause เป็น retrieval/content_gap/outdated/guardrail/other; ฟีเจอร์ที่ต้องใช้อีเมลแสดงตาม `env.mailLive` (FR-AUTH-001/004, FR-ORG-002) |
| 1.7 | 2026-10-01 | ทีมออกแบบ (AI-assisted) | ตรวจเทียบโค้ดและแก้ให้ตรงของจริง: ชื่อ cookie session (`lc.session_token`) และ `proxy.ts`; FR-CHAT-007/009/010/018/030 (ปุ่มคัดลอก, chip, แผงแหล่งอ้างอิง, ประวัติแชท, จำแชทล่าสุด); FR-AUTH-022/024 และ FR-ADM-004/BR-007 (role เดียวต่อผู้ใช้, ผู้ส่งตรวจล่าสุดอนุมัติเองไม่ได้); BR-001/016/017/021 (quota ตั้งด้วย env, รหัสผ่าน, session, stream); §6.1/6.2 (ตารางที่ไม่ได้ใช้งาน, backup, สถานะ job ลบ); §8.1 (operationId); ตัดจำนวนกฎตรวจสัญญา 17 ข้อที่ไม่มีแล้ว |
| 1.8 | 2026-10-01 | ทีมออกแบบ (AI-assisted) | ตรวจเทียบกับหน้าจอจริง: เพิ่มสถานะเนื้อหา (4 หมวด 43 ชิ้นเป็นร่าง แสดงด้วย `KB_SERVE_DRAFTS` + ป้าย "ฉบับร่าง"), พฤติกรรมโหมด `PNC_PRIMARY` (ไม่มีป้ายแหล่ง/อ้างอิง), ผลตรวจสัญญา `pnc`, ชื่อเมนู/แท็บตามบทบาท, ตัวสลับพื้นที่ทำงาน, หน้าจอ guest/แชร์/footer |
