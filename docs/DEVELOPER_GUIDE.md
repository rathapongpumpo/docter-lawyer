# 📘 คู่มือนักพัฒนา (Developer Onboarding & Architecture Guide)
### โครงการ: ดอกเตอร์ลอว์เยอร์ (Doctor Lawyer) — AI Legal Triage & Partner Lawyer Network

เอกสารฉบับนี้จัดทำขึ้นเพื่อให้นักพัฒนา (Developer) หรือทีมงานใหม่สามารถเข้ามาศึกษา ทำความเข้าใจสถาปัตยกรรม ติดตั้ง และเริ่มพัฒนาระบบต่อได้อย่างรวดเร็ว

---

## 📂 โครงสร้างไดเรกทอรีของโปรเจกต์ (Project Structure)

```
c:\Projects\legal-consult/
│
├── backend/                       # แกนหลักระบบฝั่ง Backend (Zero-Dependency Python)
│   ├── main.py                    # Entrypoint สั่งรันเซิร์ฟเวอร์
│   ├── src/
│   │   ├── api/
│   │   │   └── server.py          # HTTP Web Server & REST API Handlers (ThreadingHTTPServer)
│   │   ├── services/
│   │   │   ├── rule_engine.py     # Tier 1: Built-in Rule Engine (11 หมวด, 33 ฎีกา, 0 Token)
│   │   │   ├── ai_router.py       # Tier 2: AI Router (Gemini / OpenAI / Heuristic Demo)
│   │   │   └── auth_service.py    # ระบบสมาชิก Google / Email OTP และโควตา 1/3 ครั้ง
│   │   └── data/
│   │       ├── doctor_lawyer.db   # ฐานข้อมูล SQLite (Users, Sessions, Guest records)
│   │       └── legal_knowledge/   # ฐานข้อมูลกฎหมาย 11 หมวดหมู่ (JSON files + index.json)
│   └── tests/                     # ชุดทดสอบ Unit & Integration Tests (100% Pass)
│       ├── test_legal_knowledge_base.py
│       ├── test_rule_engine.py
│       ├── test_quota_manager.py
│       ├── test_ai_router.py
│       ├── test_auth_service.py
│       └── test_auth_api.py
│
├── frontend/                      # หน้าบ้านแบบ Single-File Web & LINE LIFF Simulator
│   └── index.html                 # HTML5 + CSS3 + Vanilla JS (ไม่ต้อง Build, โหลดเร็ว < 200ms)
│
├── docs/                          # เอกสารประกอบระบบ
│   ├── DEVELOPER_GUIDE.md         # คู่มือนักพัฒนา (ไฟล์นี้)
│   └── legal_knowledge_base/      # เอกสารกฎหมาย 11 หมวดหมู่ฉบับ Markdown พร้อมสารบัญ
│       ├── README.md
│       └── 01_cybercrime_fraud.md ... 11_ecommerce_tax.md
│
├── scripts/                       # สคริปต์อำนวยความสะดวก 1-Click
│   ├── start_server.bat           # รันเซิร์ฟเวอร์ Local (พอร์ต 3000)
│   ├── start_public_tunnel.bat    # เปิด HTTPS Tunnel สาธารณะสำหรับ Demo ทันที
│   ├── test_pipeline.bat          # รันชุดทดสอบ E2E ทั้งระบบ 1 คลิก
│   └── test_two_tier_pipeline.py  # สคริปต์ทดสอบ End-to-End Test Suite 5 สถานการณ์
│
├── .env.example                   # ตัวอย่างไฟล์ตั้งค่าคอนฟิกูเรชัน
├── .gitignore                     # ไฟล์คัดกรอง Git
├── Dockerfile                     # คอนเทนเนอร์สำหรับรันบน Cloud
├── render.yaml                    # คอนฟิก 1-Click Deploy บน Render.com (Free Tier)
├── Procfile                       # คอนฟิกสำหรับ Railway / Heroku
└── README.md                      # เอกสารสรุปภาพรวมและวิธีใช้งาน
```

---

## 🚀 การติดตั้งและรันระบบบนเครื่องใหม่ (Quickstart)

### ข้อกำหนดระบบ (Prerequisites)
- **Python 3.11 หรือสูงกว่า** (ใช้ Standard Library ล้วน ไม่ต้อง `pip install` แพ็กเกจภายนอกสำหรับระบบพื้นฐาน)
- ระบบปฏิบัติการ: Windows, macOS หรือ Linux

### 1. โคลนโปรเจกต์
```bash
git clone https://github.com/rathapongpumpo/docter-lawyer.git
cd docter-lawyer
```

### 2. ตั้งค่าตัวแปรสภาพแวดล้อม (Environment Variables)
คัดลอกไฟล์ `.env.example` เป็น `.env`:
```bash
cp .env.example .env     # บน Linux/macOS
copy .env.example .env   # บน Windows
```
*หมายเหตุ: หากยังไม่มี API Key ระบบจะทำงานใน **โหมด Demo อัจฉริยะ (Smart Heuristic)** ให้โดยอัตโนมัติ ไม่ล่มเด็ดขาด*

### 3. เริ่มต้นรันเซิร์ฟเวอร์
- **บน Windows:** ดับเบิ้ลคลิกไฟล์ `scripts\start_server.bat` หรือพิมพ์:
  ```powershell
  python -X utf8 backend\main.py
  ```
- **บน macOS / Linux:**
  ```bash
  python3 backend/main.py
  ```
- เปิดเบราว์เซอร์ไปที่: `http://localhost:3000`

### 4. รันชุดทดสอบความถูกต้อง (Test Suite)
- **บน Windows:** ดับเบิ้ลคลิก `scripts\test_pipeline.bat` หรือพิมพ์:
  ```powershell
  python -X utf8 scripts\test_two_tier_pipeline.py
  ```
- ทดสอบครอบคลุมทุกโมดูล:
  ```powershell
  python -X utf8 -m unittest discover backend/tests
  ```

---

## ⚙️ สถาปัตยกรรมระบบ 2 ระดับ (Two-Tier Consultation Engine)

### Tier 1: Built-in Rule Engine (กฎหมายตรงตัว)
- **ไฟล์:** `backend/src/services/rule_engine.py`
- **การทำงาน:**
  - สกัดข้อมูลอ่อนไหวตาม PDPA (รหัสบัตรประชาชน, บัญชีธนาคาร, เบอร์โทรศัพท์)
  - แมตช์คีย์เวิร์ดและบริบทคดีเข้ากับ 11 หมวดกฎหมายไทย และ 33 คำพิพากษาศาลฎีกา
  - ประเมินระดับความเร่งด่วน (Urgency Score 1-3)
  - ตอบกลับโครงสร้างคำปรึกษา 6 ขั้นตอนทันทีในเวลา **< 1 มิลลิวินาที** โดย **ไม่เสีย Token (0 บาท)**

### Tier 2: AI Router (คดีเฉพาะทางและซับซ้อน)
- **ไฟล์:** `backend/src/services/ai_router.py`
- **การทำงาน:**
  - ถูกเรียกใช้งานเมื่อ Rule Engine ประเมินความมั่นใจต่ำ หรือเป็นคดีเฉพาะทางนอก 11 หมวด
  - รองรับ Gemini API, OpenAI API (`gpt-4o-mini`), หรือ Custom API Key
  - Grounding ด้วยข้อมูลกฎหมายไทย 11 หมวด เพื่อป้องกันอาการหลอน (Zero Hallucination)
  - หากยังไม่ได้ใส่ API Key จะสลับไปใช้ **Smart Heuristic Engine** โดยอัตโนมัติ

---

## 🛡️ กฎการควบคุมสิทธิ์และโควตา (Auth & Quota Policy)

- **ไฟล์:** `backend/src/services/auth_service.py`
- **กฎ 3 ข้อ:**
  1. **ผู้ใช้ทั่วไป (Guest):** ใช้งานฟรีได้ **1 ครั้ง**
     - หากถามครั้งที่ 2 จะถูก Intercept ด้วยสถานะ `AUTH_REQUIRED` พร้อมเปิด Modal ล็อกอิน
  2. **สมาชิก Google Account:** เข้าสู่ระบบด้วย Google ➔ ยืนยันตัวตนอัตโนมัติ ➔ รับฟรี **3 ครั้ง**
  3. **สมาชิก Email:** กรอกอีเมล ➔ ระบบส่งรหัส OTP 6 หลัก (อายุ 15 นาที) ➔ ยืนยัน OTP สำเร็จ ➔ รับฟรี **3 ครั้ง** (ป้องกันการกรอกอีเมลปลอม)
  4. **เมื่อโควตาสมาชิกครบ 3 ครั้ง:** ระบบจะแสดงสถานะ `QUOTA_EXCEEDED` และเปิดทางเลือกให้ส่งเรื่องต่อให้ **ทนายความพาร์ตเนอร์ผ่าน LINE OA** ทันที

---

## 💬 การส่งต่องานทนายความพาร์ตเนอร์ผ่าน LINE Official Account (LINE OA)

1. หน้าบ้านจัดทำ **"ใบสรุปข้อมูลคดี (Case Intake Brief)"** ซึ่งประกอบด้วย:
   - หมวดหมู่คดีและความเร่งด่วน
   - ข้อเท็จจริงเบื้องต้น (เซ็นเซอร์ PDPA แล้ว)
   - มาตรากฎหมายและคำพิพากษาศาลฎีกาที่เกี่ยวข้อง
   - รายการพยานหลักฐานและเอกสารที่ลูกความเตรียมไว้
2. เมื่อลูกความกดปุ่ม **"ส่งเรื่องให้ทนายพาร์ตเนอร์ (เปิด LINE OA)"**:
   - ระบบจะคัดลอกข้อความสรุปคดีลงคลิปบอร์ดของผู้ใช้ทันที
   - เด้งเปิดหน้าแชท LINE Official Account (`https://line.me/R/ti/p/@doctorlawyer`)
   - ลูกความเพียงแค่กด Paste ในแชท LINE เพื่อคุยกับทนายความต่อได้ทันที

---

## 🌐 การนำขึ้น Host และเชื่อมต่อ LINE LIFF

### 1. Deploy บน Render.com (ฟรี + ได้ HTTPS ถาวร)
1. Fork หรือ Push ขึ้น GitHub
2. ไปที่ Render ➔ New Blueprint ➔ เลือก Repository
3. Render จะอ่านคอนฟิกจาก `render.yaml` โดยอัตโนมัติ

### 2. Live Demo ทันทีผ่าน Tunnel (ไม่ต้องมีเซิร์ฟเวอร์นอก)
- ดับเบิ้ลคลิก `scripts\start_public_tunnel.bat` บนเครื่อง จะได้ Public HTTPS URL นำไปเปิดบนมือถือหรือส่งให้ลูกค้าทดสอบได้ทันที

### 3. ผูก LINE Developers Console
- นำ Public HTTPS URL ไปใส่ใน **LINE Developers Console** ➔ Channel ID: `2011732178` ➔ LIFF ID: `2011732178-nMl0LXMq`
- สามารถเปิดใช้งานผ่านลิงก์ LIFF `https://liff.line.me/2011732178-nMl0LXMq` ภายในแอปพลิเคชัน LINE ได้ทันที
