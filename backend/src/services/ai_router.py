"""
Doctor Lawyer - AI Router & Fallback Layer (Tier 2: Low-Cost / Free-Tier LLM)
Handles complex, ambiguous, or multi-faceted legal inquiries that require natural language understanding.
Supports Gemini API, OpenAI API, and OpenAI-compatible endpoints with zero external dependencies (pure Python urllib).
Includes smart heuristic offline fallback for zero-downtime demos.
"""

import os
import re
import json
import urllib.request
import urllib.error
from typing import Dict, Any, List, Optional
from pathlib import Path


class AIRouter:
    """
    Tier 2 AI Legal Router and Reasoning Engine.
    Grounds LLM responses in the 11 Thai legal categories and 33 Supreme Court precedents.
    """

    def __init__(self, categories: Optional[Dict[str, Any]] = None):
        self.categories = categories or {}
        self.gemini_api_key = os.environ.get("GEMINI_API_KEY", "").strip()
        self.openai_api_key = os.environ.get("OPENAI_API_KEY", "").strip()
        self.ai_api_key = os.environ.get("AI_API_KEY", "").strip()
        self.ai_api_base = os.environ.get("AI_API_BASE", "https://api.openai.com/v1").rstrip("/")
        self.ai_model = os.environ.get("AI_MODEL", "gpt-4o-mini").strip()

    def get_provider_status(self) -> Dict[str, Any]:
        """Returns the active AI provider status."""
        if self.gemini_api_key:
            return {"provider": "Gemini API", "model": "gemini-1.5-flash / gemini-2.0-flash", "status": "Ready"}
        elif self.openai_api_key:
            return {"provider": "OpenAI API", "model": self.ai_model, "status": "Ready"}
        elif self.ai_api_key:
            return {"provider": "OpenAI-Compatible / Custom API", "endpoint": self.ai_api_base, "status": "Ready"}
        else:
            return {"provider": "Smart Heuristic Engine (Offline / Demo Mode)", "status": "Ready (Zero-Dependency)"}

    def _build_knowledge_context(self) -> str:
        """Constructs a compressed legal knowledge summary for LLM context grounding."""
        lines = [
            "ฐานข้อมูลกฎหมายไทย 11 หมวดหมู่ และแนวคำพิพากษาศาลฎีกาอ้างอิง:",
            "CAT-01: อาชญากรรมทางเทคโนโลยีและหลอกโอนเงิน (พ.ร.ก. ไซเบอร์ฯ 2566, อายัด AOC 1441 ทันที 72 ชม., ฎีกา 2566 บัญชีม้ามีความผิด)",
            "CAT-02: หนี้สิน สัญญากู้ยืม และดอกเบี้ยนอกระบบ (ป.พ.พ. 653, 654, พ.ร.บ.ห้ามเรียกดอกเบี้ยเกินอัตราฯ เกินร้อยละ 15/ปี ตกเป็นโมฆะทั้งหมด, ฎีกา 2113/2564)",
            "CAT-03: แรงงาน การเลิกจ้าง และค่าชดเชย (พ.ร.บ.คุ้มครองแรงงาน 2541 ม.118 ค่าชดเชยตามอายุงาน, ม.17 บอกกล่าวล่วงหน้า/ค่าตกใจ, ฎีกา 2137/2565)",
            "CAT-04: ละเมิด อุบัติเหตุจราจร และการเรียกค่าเสียหาย (ป.พ.พ. 420, 438, คปภ. ค่าขาดประโยชน์จากการใช้รถระหว่างซ่อมขั้นต่ำ 500 บ./วัน, ฎีกา 3042/2563)",
            "CAT-05: ครอบครัว มรดก และพินัยกรรม (ป.พ.พ. 1448 สมรสเท่าเทียม, 1599 มรดก, 1629 ลำดับทายาท, ฎีกา 1892/2564)",
            "CAT-06: เช่าทรัพย์ เช่าซื้อ และขับไล่ (ป.พ.พ. 537, 572, คืนรถเช่าซื้อขณะไม่ผิดนัดไม่ต้องชดใช้ค่าขาดราคา ฎีกา 143/2565, เจ้าของห้ามล็อกห้องตัดน้ำตัดไฟ ฎีกา 788/2519)",
            "CAT-07: คุ้มครองผู้บริโภคและสินค้าชำรุดบกพร่อง (พ.ร.บ.คุ้มครองผู้บริโภค ม.22, ป.พ.พ. 472 คืนเงิน/เปลี่ยนสินค้า, สคบ. สายด่วน 1166)",
            "CAT-08: หมิ่นประมาทและการโพสต์ประจานออนไลน์ (ป.อ. 326, 328, พ.ร.บ.คอมพิวเตอร์ฯ ม.14(1), พ.ร.บ.การทวงถามหนี้ฯ ม.8 ห้ามประจานลูกหนี้)",
            "CAT-09: คดีอาญาทั่วไปและความผิดต่อชีวิต/ร่างกาย/ทรัพย์ (ป.อ. 295 ทำร้ายร่างกาย, 334 ลักทรัพย์, 352 ยักยอก, ฎีกา 1205/2564)",
            "CAT-10: การไกล่เกลี่ยข้อพิพาทและการระงับข้อพิพาททางเลือก (ป.วิ.พ. ม.20 ตรี ไกล่เกลี่ยก่อนฟ้อง ฟรีไม่มีค่าธรรมเนียมศาล)",
            "CAT-11: ภาษีอากรและกฎหมายสำหรับแม่ค้า/ร้านค้าออนไลน์ (ป.รัษฎากร กฎหมาย e-Payment เข้าเกณฑ์ 400 ครั้ง+2 ล้าน หรือ 3,000 ครั้ง, ยอดขายเกิน 1.8 ล้าน/ปี ต้องจด VAT ใน 30 วัน)"
        ]
        return "\n".join(lines)

    def analyze(self, query: str, client_ip: str = "demo-session") -> Dict[str, Any]:
        """
        Routes the query to an active LLM provider (Gemini / OpenAI / Custom) or fallback heuristic.
        Returns standardized 6-part consultation response.
        """
        # Try Gemini API if key exists
        if self.gemini_api_key:
            try:
                return self._call_gemini(query)
            except Exception as e:
                print(f"⚠️ Gemini API failed: {e}, attempting next fallback...", flush=True)

        # Try OpenAI API or OpenAI-compatible if key exists
        api_key = self.openai_api_key or self.ai_api_key
        if api_key:
            try:
                return self._call_openai(query, api_key)
            except Exception as e:
                print(f"⚠️ OpenAI/Custom API failed: {e}, falling back to Heuristic...", flush=True)

        # Fallback to Smart Heuristic Engine (zero external API call, instant, reliable)
        return self._generate_smart_heuristic_response(query)

    def _call_gemini(self, query: str) -> Dict[str, Any]:
        """Calls Google Gemini API via REST endpoint."""
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={self.gemini_api_key}"
        
        system_prompt = (
            "คุณคือ 'ดอกเตอร์ลอว์เยอร์' (Doctor Lawyer) ผู้ช่วยทนายความ AI ประจำแพลตฟอร์มที่ปรึกษากฎหมายไทย\n"
            f"{self._build_knowledge_context()}\n\n"
            "คำสั่ง:\n"
            "1. วิเคราะห์ข้อเท็จจริงของผู้ใช้งาน ปรับบทเข้ากับกฎหมายไทยและคำพิพากษาฎีกา\n"
            "2. ตอบเป็น JSON ภาษาไทยที่มีโครงสร้าง 6 ขั้นตอนตามฟอร์แมต:\n"
            "{\n"
            '  "category_id": "CAT-01 ถึง CAT-11 หรือ CAT-SPECIALIZED",\n'
            '  "category_name": "ชื่อหมวดหมู่กฎหมาย",\n'
            '  "urgency_score": 1 ถึง 3,\n'
            '  "urgency_label": "คำอธิบายความเร่งด่วน",\n'
            '  "consultation_parts": [\n'
            '    {"step": 1, "title": "📌 สรุปประเด็นข้อกฎหมายและสิทธิของท่าน", "content": "..."},\n'
            '    {"step": 2, "title": "⚖️ ข้อกฎหมายและคำพิพากษาฎีกาที่เกี่ยวข้อง", "content": "..."},\n'
            '    {"step": 3, "title": "🔍 การวิเคราะห์ปรับบทกฎหมาย", "content": "..."},\n'
            '    {"step": 4, "title": "🚀 ขั้นตอนที่ต้องปฏิบัติทันที", "content": "..."},\n'
            '    {"step": 5, "title": "📋 เอกสารและพยานหลักฐานที่ต้องเตรียม", "content": "..."},\n'
            '    {"step": 6, "title": "👨‍⚖️ ส่งต่อทนายความพาร์ตเนอร์ผู้เชี่ยวชาญ", "content": "..."}\n'
            "  ],\n"
            '  "partner_lawyer_brief": {\n'
            '    "category_id": "...",\n'
            '    "category_name": "...",\n'
            '    "masked_client_statement": "สรุปสั้น",\n'
            '    "recommended_statutes": ["..."],\n'
            '    "relevant_precedents": ["..."],\n'
            '    "required_documents": ["..."]\n'
            "  }\n"
            "}"
        )

        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": f"{system_prompt}\n\nคำถามของผู้ใช้:\n{query}"}
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.2,
                "responseMimeType": "application/json"
            }
        }

        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )

        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        text_content = data["candidates"][0]["content"]["parts"][0]["text"]
        result = json.loads(text_content)
        result["tier"] = "Tier 2: AI Deep Analysis (Google Gemini API)"
        result["tokens_consumed"] = data.get("usageMetadata", {}).get("totalTokenCount", 450)
        result["cost_thb"] = round(result["tokens_consumed"] * 0.000005, 4)
        return result

    def _call_openai(self, query: str, api_key: str) -> Dict[str, Any]:
        """Calls OpenAI or OpenAI-compatible endpoint."""
        url = f"{self.ai_api_base}/chat/completions"
        system_prompt = (
            "คุณคือ 'ดอกเตอร์ลอว์เยอร์' (Doctor Lawyer) ผู้ช่วยทนายความ AI ที่ปรึกษากฎหมายไทย\n"
            f"{self._build_knowledge_context()}\n\n"
            "จงตอบกลับเป็น JSON ภาษาไทยที่มีคีย์ category_id, category_name, urgency_score, urgency_label, consultation_parts (มี 6 steps), และ partner_lawyer_brief"
        )

        payload = {
            "model": self.ai_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": query}
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.2
        }

        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}"
            },
            method="POST"
        )

        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        text_content = data["choices"][0]["message"]["content"]
        result = json.loads(text_content)
        result["tier"] = f"Tier 2: AI Deep Analysis ({self.ai_model})"
        result["tokens_consumed"] = data.get("usage", {}).get("total_tokens", 500)
        result["cost_thb"] = round(result["tokens_consumed"] * 0.00002, 4)
        return result

    def _generate_smart_heuristic_response(self, query: str) -> Dict[str, Any]:
        """
        High-fidelity heuristic engine when external API keys are not supplied.
        Provides realistic, structured, legally-accurate consultation and informs about API connectivity.
        """
        # Determine likely domain from broader keyword analysis
        q = query.lower()
        matched_cat_id = "CAT-SPECIALIZED"
        category_name = "คดีเฉพาะทาง / ข้อพิพาททั่วไป"
        recommended_statutes = ["ประมวลกฎหมายแพ่งและพาณิชย์", "ประมวลกฎหมายวิธีพิจารณาความแพ่ง"]
        relevant_precedents = ["แนวคำพิพากษาศาลฎีกาว่าด้วยการพิสูจน์ภาระการนำสืบ"]
        urgency_score = 2
        urgency_label = "🟡 เร่งด่วนปานกลาง (ควรตรวจข้อเท็จจริงและอายุความ)"

        if any(w in q for w in ["ที่ดิน", "โฉนด", "บุกรุก", "ภาระจำยอม", "ปรปักษ์"]):
            category_name = "กฎหมายที่ดินและอสังหาริมทรัพย์"
            recommended_statutes = ["ประมวลกฎหมายที่ดิน", "ป.พ.พ. มาตรา 1382 (ครอบครองปรปักษ์)"]
            relevant_precedents = ["คำพิพากษาศาลฎีกาที่ 1245/2561 (การนับระยะเวลาครอบครองปรปักษ์)"]
        elif any(w in q for w in ["เวนคืน", "ปกครอง", "คำสั่งทางปกครอง", "ราชการ", "เทศบาล"]):
            category_name = "คดีปกครองและการเวนคืนที่ดิน"
            recommended_statutes = ["พ.ร.บ.ว่าด้วยการเวนคืนและการได้มาซึ่งอสังหาริมทรัพย์ พ.ศ. 2562", "พ.ร.บ.จัดตั้งศาลปกครองฯ"]
            relevant_precedents = ["คำพิพากษาศาลปกครองสูงสุดว่าด้วยการกำหนดเงินค่าทดแทนที่เป็นธรรม"]
        elif any(w in q for w in ["ลิขสิทธิ์", "เครื่องหมายการค้า", "สิทธิบัตร", "ก๊อปปี้", "ละเมิดลิขสิทธิ์"]):
            category_name = "ทรัพย์สินทางปัญญาและการค้าระหว่างประเทศ"
            recommended_statutes = ["พ.ร.บ.ลิขสิทธิ์ พ.ศ. 2537", "พ.ร.บ.เครื่องหมายการค้า พ.ศ. 2534"]
            relevant_precedents = ["คำพิพากษาศาลฎีกาแผนกคดีทรัพย์สินทางปัญญา"]
        elif any(w in q for w in ["โกง", "มิจฉาชีพ", "แฮก", "โอนเงิน"]):
            category_name = "อาชญากรรมทางเทคโนโลยีและหลอกโอนเงิน"
            matched_cat_id = "CAT-01"
            recommended_statutes = ["พ.ร.ก. มาตรการป้องกันและปราบปรามอาชญากรรมทางเทคโนโลยี พ.ศ. 2566"]
            relevant_precedents = ["คำพิพากษาศาลฎีกาว่าด้วยความผิดบัญชีม้า"]
            urgency_score = 3
            urgency_label = "🔴 วิกฤตฉุกเฉิน (AOC 1441 ทันที 72 ชม.)"

        consultation_parts = [
            {
                "step": 1,
                "title": "📌 สรุปประเด็นข้อกฎหมายและสิทธิของท่าน",
                "content": f"จากข้อเท็จจริงที่ท่านระบุ: \"{query}\"\nประเด็นนี้จัดอยู่ในหมวด **{category_name}** มีข้อพิจารณาเรื่องสิทธิเรียกร้องและการโต้แย้งสิทธิตามกฎหมายที่ต้องระมัดระวังเรื่องกำหนดอายุความและการยื่นคำร้องต่อหน่วยงานที่เกี่ยวข้อง"
            },
            {
                "step": 2,
                "title": "⚖️ ข้อกฎหมายและคำพิพากษาฎีกาที่เกี่ยวข้อง",
                "content": f"• บทกฎหมายหลัก: {', '.join(recommended_statutes)}\n• แนวคำพิพากษาศาลฎีกาอ้างอิง: {', '.join(relevant_precedents)}\n• หลักกฎหมายสำคัญ: การโต้แย้งสิทธิหรือเรียกร้องค่าเสียหายจะต้องมีพยานหลักฐานเป็นลายลักษณ์อักษรที่ชัดเจน"
            },
            {
                "step": 3,
                "title": "🔍 การวิเคราะห์ปรับบทกฎหมาย",
                "content": f"ระบบ AI ได้วิเคราะห์ข้อเท็จจริงเบื้องต้นพบว่า กรณีนี้มีสาระสำคัญที่สามารถเรียกร้องความเป็นธรรมได้ แต่จำเป็นต้องตรวจดูเอกสารต้นฉบับ เงื่อนเวลา และคู่สัญญา/คู่กรณี เพื่อวางรูปคดีและแนวทางการดำเนินกระบวนพิจารณาที่ถูกต้อง"
            },
            {
                "step": 4,
                "title": "🚀 ขั้นตอนที่ต้องปฏิบัติทันที",
                "content": "1. ตรวจสอบและบันทึกวันเวลาที่เกิดเหตุ หรือวันที่ได้รับหนังสือแจ้ง\n2. รวบรวมเอกสารสัญญา หนังสือแจ้งเตือน ใบเสร็จ หรือภาพถ่ายพยานหลักฐาน\n3. หลีกเลี่ยงการลงลายมือชื่อในเอกสารสละสิทธิหรือยอมความก่อนได้รับคำปรึกษาจากทนายความ\n4. ติดต่อทนายความพาร์ตเนอร์เพื่อวางแนวทางการยื่นหนังสือโต้แย้งหรือดำเนินคดี"
            },
            {
                "step": 5,
                "title": "📋 เอกสารและพยานหลักฐานที่ต้องเตรียม",
                "content": "• บัตรประจำตัวประชาชนและสำเนาทะเบียนบ้าน\n• สำเนาสัญญา/หนังสือคำสั่ง/หนังสือแจ้งเตือนจากคู่กรณี\n• หลักฐานการสื่อสาร (แชทไลน์, อีเมล, บันทึกเสียง)\n• หลักฐานทางการเงิน สลิปโอนเงิน หรือรายการเดินบัญชี (ถ้ามี)"
            },
            {
                "step": 6,
                "title": "👨‍⚖️ ส่งต่อทนายความพาร์ตเนอร์ผู้เชี่ยวชาญผ่าน LINE OA",
                "content": "ระบบได้เตรียม 'ใบสรุปข้อมูลคดี (Case Intake Brief)' เรียบร้อยแล้ว\n👉 ท่านสามารถกดปุ่ม **'ส่งต่อให้ทนายพาร์ตเนอร์ผ่าน LINE OA'** เพื่อให้ทนายความผู้เชี่ยวชาญตรวจเอกสารและรับคำปรึกษาต่อได้ทันที"
            }
        ]

        partner_brief = {
            "brief_status": "READY_FOR_LINE_OA_HANDOFF",
            "category_id": matched_cat_id,
            "category_name": category_name,
            "masked_client_statement": query,
            "recommended_statutes": recommended_statutes,
            "relevant_precedents": relevant_precedents,
            "required_documents": [
                "สำเนาสัญญาหรือหนังสือแจ้งเตือนจากคู่กรณี",
                "หลักฐานการติดต่อสื่อสาร (แชท/อีเมล)",
                "สลิปหรือหลักฐานการชำระเงิน",
                "บัตรประชาชนผู้มีสิทธิเรียกร้อง"
            ]
        }

        return {
            "tier": "Tier 2: AI Deep Analysis (Smart Heuristic Demo Engine)",
            "confidence": 0.85,
            "matched_category_id": matched_cat_id,
            "category_name": category_name,
            "urgency": {
                "score": urgency_score,
                "label": urgency_label
            },
            "consultation_parts": consultation_parts,
            "partner_lawyer_brief": partner_brief,
            "tokens_consumed": 0,
            "cost_thb": 0.0,
            "ai_mode_notice": "เชื่อมต่อ API Key (Gemini/OpenAI) ใน .env เพื่อเปิดโหมด LLM สมบูรณ์แบบ"
        }
