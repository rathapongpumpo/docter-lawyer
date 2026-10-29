"""
Doctor Lawyer - Built-in Rule & Keyword Engine (Tier 1: Zero-Cost & Deterministic)
Performs fast (<50ms), zero-token legal triage, statutory matching, and 6-part advice synthesis
across all 11 Thai legal categories and Supreme Court precedents.
"""

import re
import json
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple


class RuleEngine:
    """
    Tier 1 Legal Evaluation Engine.
    Operates 100% offline with zero external API dependencies and zero token costs.
    """

    def __init__(self, data_dir: Optional[str] = None):
        self.data_dir = Path(data_dir) if data_dir else (
            Path(__file__).resolve().parent.parent / "data" / "legal_knowledge"
        )
        self.categories = self._load_all_categories()

    def _load_all_categories(self) -> Dict[str, Dict[str, Any]]:
        """Loads all category JSON files indexed by category ID and file stem."""
        index_file = self.data_dir / "index.json"
        if not index_file.exists():
            raise FileNotFoundError(f"index.json not found at {self.data_dir}")

        with open(index_file, "r", encoding="utf-8") as f:
            index_data = json.load(f)

        loaded = {}
        for cat in index_data.get("categories", []):
            cat_file = self.data_dir / cat.get("file")
            if cat_file.exists():
                with open(cat_file, "r", encoding="utf-8") as f:
                    cat_content = json.load(f)
                    loaded[cat.get("id")] = cat_content
        return loaded

    def mask_pii(self, text: str) -> str:
        """
        Masks Thai PII (National ID, Bank Accounts, Phone Numbers) for PDPA compliance.
        """
        # Thai National ID: 13 digits
        masked = re.sub(r"\b\d{1}\s?-?\d{4}\s?-?\d{5}\s?-?\d{2}\s?-?\d{1}\b", "[รหัสบัตรประชาชน 13 หลัก ปิดข้อมูล PDPA]", text)
        # Bank Account: 10-12 digits
        masked = re.sub(r"\b\d{3}\s?-?\d{1}\s?-?\d{5}\s?-?\d{1}\b", "[เลขที่บัญชีธนาคาร ปิดข้อมูล PDPA]", masked)
        # Thai Phone Numbers (08x, 09x, 06x)
        masked = re.sub(r"\b0[689]\d{1}\s?-?\d{3}\s?-?\d{4}\b", "[เบอร์โทรศัพท์ ปิดข้อมูล PDPA]", masked)
        return masked

    def match_category(self, text: str) -> Tuple[Optional[Dict[str, Any]], float, List[str]]:
        """
        Evaluates input text against all 11 categories using weighted keyword matching.
        Returns: (best_matching_category, confidence_score [0.0-1.0], matched_keywords_list)
        """
        clean_text = text.lower()
        best_cat = None
        best_score = 0.0
        best_matches = []

        for cat_id, cat_data in self.categories.items():
            keywords = cat_data.get("keywords", [])
            matches = []
            score = 0.0

            for kw in keywords:
                kw_lower = kw.lower()
                if kw_lower in clean_text:
                    matches.append(kw)
                    # Length-based weight: longer specific phrases carry more confidence
                    score += 1.0 + (len(kw_lower) * 0.1)

            # Extra weight if domain-specific terms match
            if cat_id == "CAT-01" and any(k in clean_text for k in ["โอนเงิน", "มิจฉาชีพ", "บัญชีม้า"]):
                score += 2.0
            elif cat_id == "CAT-02" and any(k in clean_text for k in ["ดอกเบี้ย", "กู้เงิน", "ยืมเงิน"]):
                score += 2.0
            elif cat_id == "CAT-03" and any(k in clean_text for k in ["เลิกจ้าง", "ไล่ออก", "ค่าชดเชย", "ค่าตกใจ"]):
                score += 2.0
            elif cat_id == "CAT-04" and any(k in clean_text for k in ["รถชน", "อุบัติเหตุ", "ค่าขาดประโยชน์"]):
                score += 2.0
            elif cat_id == "CAT-05" and any(k in clean_text for k in ["มรดก", "พินัยกรรม", "ทายาท", "ฟ้องหย่า"]):
                score += 2.0
            elif cat_id == "CAT-06" and any(k in clean_text for k in ["เช่าห้อง", "ตัดน้ำตัดไฟ", "ล็อกห้อง", "เช่าซื้อ", "ไฟแนนซ์"]):
                score += 2.0
            elif cat_id == "CAT-07" and any(k in clean_text for k in ["ไม่ตรงปก", "ชำรุด", "คืนเงิน", "สคบ"]):
                score += 2.0
            elif cat_id == "CAT-08" and any(k in clean_text for k in ["ประจาน", "หมิ่นประมาท", "โพสต์ด่า"]):
                score += 2.0
            elif cat_id == "CAT-09" and any(k in clean_text for k in ["ทำร้ายร่างกาย", "ขโมย", "ลักทรัพย์", "ยักยอก"]):
                score += 2.0
            elif cat_id == "CAT-10" and any(k in clean_text for k in ["ไกล่เกลี่ย", "ยอมความ", "ประนีประนอม", "มาตรา 20 ตรี"]):
                score += 2.0
            elif cat_id == "CAT-11" and any(k in clean_text for k in ["ภาษี", "แม่ค้าออนไลน์", "vat", "สรรพากร", "1.8 ล้าน", "e-payment"]):
                score += 2.0

            # Normalize confidence (capped at 1.0)
            confidence = min(1.0, score / 4.0)

            if confidence > best_score:
                best_score = confidence
                best_cat = cat_data
                best_matches = matches

        return best_cat, best_score, best_matches

    def calculate_urgency(self, text: str, cat_data: Optional[Dict[str, Any]]) -> Tuple[int, str]:
        """
        Calculates urgency score (0-3) and urgency explanation based on situational trigger phrases.
        """
        clean_text = text.lower()

        # Critical Triggers (Urgency 3)
        critical_triggers = [
            "เพิ่งโอน", "ชั่วโมงที่แล้ว", "นาทีที่แล้ว", "ภายใน 72", "72 ชั่วโมง", "โดนบล็อก",
            "ข่มขู่ทำร้าย", "จะมาทำร้าย", "หมายเรียก", "หมายจับ", "กำลังจะโดนจับ", "ถูกทำร้ายร่างกาย"
        ]
        if any(tr in clean_text for tr in critical_triggers):
            return 3, "🔴 วิกฤตฉุกเฉินระดับสูงสุด (มีกรอบเวลาจำกัด เช่น 72 ชม. หรือมีอันตรายต่อสิทธิ/ทรัพย์สิน)"

        # Medium-High Triggers (Urgency 2)
        urgent_triggers = [
            "สรรพากรเรียก", "หนังสือแจ้ง", "ถูกเลิกจ้าง", "ให้ออกสิ้นเดือน", "โดนทวงหนี้", "ประจาน",
            "ยึดรถ", "ตัดน้ำตัดไฟ", "ใกล้หมดอายุความ", "ฟ้องร้อง", "ค้างค่าเช่า", "รถชน"
        ]
        if any(tr in clean_text for tr in urgent_triggers):
            return 2, "🟡 เร่งด่วนปานกลางถึงสูง (มีข้อพิพาทเกิดขึ้นแล้ว หรือมีหนังสือทวงถาม/เรียกตรวจ)"

        # Default to category urgency or 1
        default_urg = cat_data.get("urgency_default", 1) if cat_data else 1
        if default_urg >= 2:
            return default_urg, "🟡 มีข้อพิพาทเกิดขึ้นแล้ว ควรเร่งรวบรวมหลักฐาน"
        return 1, "🔵 สอบถามข้อมูลกฎหมายทั่วไป ยังไม่มีกำหนดเวลาวิกฤต"

    def evaluate(self, user_inquiry: str, confidence_threshold: float = 0.50) -> Dict[str, Any]:
        """
        Full evaluation pipeline:
        1. PDPA PII Masking
        2. Rule-based category & keyword matching
        3. Urgency calculation
        4. Statutory extraction & Supreme Court precedent selection
        5. Standardized 6-Part Consultation Synthesis
        6. Partner Lawyer Referral Lead Generation
        """
        masked_text = self.mask_pii(user_inquiry)
        matched_cat, confidence, matched_kws = self.match_category(masked_text)

        # Check if confidence meets threshold
        is_confident = (matched_cat is not None) and (confidence >= confidence_threshold)

        if not is_confident:
            return self._build_fallback_response(masked_text)

        urgency_score, urgency_label = self.calculate_urgency(masked_text, matched_cat)

        # Build Standardized 6-Part Advice + Supreme Court Precedents
        consultation_parts = self._synthesize_consultation(
            masked_text=masked_text,
            cat_data=matched_cat,
            urgency_score=urgency_score
        )

        # Build Partner Lawyer Intake Brief
        partner_brief = self._build_partner_lawyer_brief(
            masked_text=masked_text,
            cat_data=matched_cat,
            urgency_score=urgency_score,
            urgency_label=urgency_label
        )

        return {
            "tier": "Tier 1: Built-in Rule Engine (Zero-Cost)",
            "confidence": round(confidence, 2),
            "matched_category_id": matched_cat.get("id"),
            "category_name": matched_cat.get("category_name_th"),
            "category_name_en": matched_cat.get("category_name_en"),
            "matched_keywords": matched_kws,
            "urgency": {
                "score": urgency_score,
                "label": urgency_label
            },
            "consultation_parts": consultation_parts,
            "supreme_court_precedents": matched_cat.get("supreme_court_judgments", []),
            "hotlines": matched_cat.get("hotlines", []),
            "partner_lawyer_brief": partner_brief,
            "tokens_consumed": 0,
            "cost_thb": 0.0
        }

    def _synthesize_consultation(
        self,
        masked_text: str,
        cat_data: Dict[str, Any],
        urgency_score: int
    ) -> List[Dict[str, Any]]:
        """Synthesizes the standard structured consultation."""
        parts = []
        cat_id = cat_data.get("id")

        # Part 1: Summary
        p1 = f"ท่านกำลังประสบปัญหาข้อพิพาทในหมวด **{cat_data.get('category_name_th')}** ซึ่งระบบได้ตรวจพบข้อเท็จจริงและจัดเตรียมแนวทางตามบทบัญญัติแห่งกฎหมายไทยและแนวคำพิพากษาศาลฎีกาไว้ให้เรียบร้อยแล้ว"
        parts.append({"step": 1, "title": "📌 สรุปประเด็นข้อกฎหมาย", "content": p1})

        # Part 2: Statutory Provisions
        p2_lines = []
        for st in cat_data.get("statutes", []):
            p2_lines.append(f"• **{st.get('law_title')}**")
            for sec in st.get("sections", []):
                p2_lines.append(f"  - **{sec.get('section_no')} ({sec.get('title')}):** {sec.get('text')}")
                if sec.get("penalties"):
                    p2_lines.append(f"    *(โทษ: {sec.get('penalties')})*")
                if sec.get("civil_consequence"):
                    p2_lines.append(f"    *(ผลทางแพ่ง: {sec.get('civil_consequence')})*")
        parts.append({"step": 2, "title": "⚖️ สิทธิและบทบัญญัติทางกฎหมายที่คุ้มครอง", "content": "\n".join(p2_lines)})

        # Part 3: Supreme Court Precedents (New Highlight)
        p3_lines = []
        for idx, jm in enumerate(cat_data.get("supreme_court_judgments", []), 1):
            p3_lines.append(f"• **{jm.get('case_no')}:**")
            p3_lines.append(f"  - *ประเด็น:* {jm.get('issue')}")
            p3_lines.append(f"  - *บรรทัดฐานศาลฎีกา:* **\"{jm.get('core_principle')}\"**")
        parts.append({"step": 3, "title": "🏛️ คำพิพากษาศาลฎีกาเทียบเคียง (Supreme Court Precedents)", "content": "\n".join(p3_lines)})

        # Part 4: Immediate Action Plan
        p4_lines = []
        if cat_id == "CAT-01":
            p4_lines.append("1. **โทรอายัดเงินด่วนที่สุด:** ติดต่อศูนย์ AOC 1441 ทันทีเพื่อขอรหัสแจ้งระงับธุรกรรม (Bank Case ID) ภายใน 72 ชั่วโมง")
            p4_lines.append("2. **รวบรวมสลิปโอนเงินและแชท:** แคปเจอร์หน้าจอแชทและสลิปที่มี QR Code ห้ามลบแชทเด็ดขาด")
            p4_lines.append("3. **แจ้งความดำเนินคดีภายใน 72 ชม.:** นำรหัสอายัดไปแจ้งความที่สถานีตำรวจหรือผ่าน thaipoliceonline.go.th")
        elif cat_id == "CAT-02":
            p4_lines.append("1. **หยุดจ่ายดอกเบี้ยที่เกินอัตราทันที:** กฎหมายถือว่าดอกเบี้ยเกิน 15%/ปี เป็นโมฆะทั้งจำนวน")
            p4_lines.append("2. **คำนวณเงินที่จ่ายไปแล้ว:** นำยอดเงินที่เคยจ่ายไปหักเงินต้นทั้งหมด หากจ่ายเกินเงินต้นแล้ว หนี้ย่อมระงับสิ้นไป")
            p4_lines.append("3. **บันทึกหลักฐานการทวงหนี้:** หากเจ้าหนี้ข่มขู่หรือประจาน ให้บันทึกเสียง/ภาพเพื่อดำเนินคดีตาม พ.ร.บ.ทวงหนี้")
        elif cat_id == "CAT-03":
            p4_lines.append("1. **ขอหนังสือเลิกจ้างเป็นลายลักษณ์อักษร:** ระบุวันที่ให้ออกและสาเหตุการเลิกจ้าง")
            p4_lines.append("2. **ห้ามเซ็นใบลาออกเด็ดขาด:** มิฉะนั้นจะเสียสิทธิเงินชดเชยตามอายุงานและค่าตกใจทันที")
            p4_lines.append("3. **ยื่นคำร้อง คร.7 ต่อพนักงานตรวจแรงงาน:** ที่สำนักงานสวัสดิการและคุ้มครองแรงงาน หรือยื่นออนไลน์")
        elif cat_id == "CAT-11":
            p4_lines.append("1. **รวบรวม Statement ทุกบัญชี:** ดึงรายการเดินบัญชีทั้งปีเพื่อรวมยอดเงินเข้าที่แท้จริง")
            p4_lines.append("2. **แยกประเภทเงินโอน:** แยกรายรับจากการขายของจริง ออกจากเงินยืมหรือเงินโอนระหว่างคนในครอบครัว")
            p4_lines.append("3. **ตรวจเช็กเกณฑ์ VAT 1.8 ล้าน:** หากยอดขายรวมเกิน 1.8 ล้านบาท ต้องรีบเข้าพบเจ้าหน้าที่หรือปรึกษาผู้เชี่ยวชาญเพื่อขอลดหย่อนเบี้ยปรับ")
        else:
            p4_lines.append("1. รวบรวมพยานหลักฐาน สัญญา สลิป และข้อความสนทนาทั้งหมด")
            p4_lines.append("2. ส่งหนังสือบอกกล่าวทวงถามหรือหนังสือเตือนไปยังคู่กรณี")
            p4_lines.append("3. พิจารณาใช้กระบวนการไกล่เกลี่ยข้อพิพาทก่อนฟ้องคดี (ป.วิ.พ. มาตรา 20 ตรี) ซึ่งไม่มีค่าธรรมเนียมศาล")
        parts.append({"step": 4, "title": "🚀 ลำดับขั้นตอนที่ต้องปฏิบัติทันที", "content": "\n".join(p4_lines)})

        # Part 5: Evidence Checklist
        ev_lines = [f"• {ev}" for ev in cat_data.get("evidence_checklist", [])]
        parts.append({"step": 5, "title": "📁 พยานหลักฐานที่ต้องจัดเตรียม (Evidence Checklist)", "content": "\n".join(ev_lines)})

        # Part 6: Partner Lawyer Handoff & Hotlines
        hl_lines = []
        for h in cat_data.get("hotlines", []):
            num = f" โทร. **{h.get('number')}**" if h.get("number") else ""
            press = f" กด {h.get('press')}" if h.get("press") else ""
            hl_lines.append(f"• **{h.get('name')}:**{num}{press}")

        p6_content = (
            "📞 **ช่องทางช่วยเหลือและสายด่วนภาครัฐ:**\n" + "\n".join(hl_lines) + "\n\n"
            "🤝 **บริการส่งต่องานให้ทนายความพาร์ตเนอร์ (Partner Lawyer Handoff):**\n"
            "หากเคสของท่านมีมูลค่าความเสียหายสูง คู่กรณีไม่ยอมเจรจา หรือต้องการให้ทนายความเข้ามาร่วมตรวจเอกสาร ร่างหนังสือบอกกล่าว หรือดำเนินคดีว่าความในศาล\n"
            "👉 ท่านสามารถกดปุ่ม **'นัดหมายปรึกษาทนายความพาร์ตเนอร์'** เพื่อส่งสรุปรูปคดีนี้ให้ทนายความผู้เชี่ยวชาญเฉพาะทางติดต่อกลับได้ทันที"
        )
        parts.append({"step": 6, "title": "👨‍⚖️ ส่งต่อทนายความพาร์ตเนอร์ & ช่องทางช่วยเหลือ", "content": p6_content})

        return parts

    def _build_partner_lawyer_brief(
        self,
        masked_text: str,
        cat_data: Dict[str, Any],
        urgency_score: int,
        urgency_label: str
    ) -> Dict[str, Any]:
        """
        Creates a structured Case Intake Brief ready to be handed off to a partner lawyer.
        """
        return {
            "brief_status": "READY_FOR_HANDOFF",
            "category_id": cat_data.get("id"),
            "category_name": cat_data.get("category_name_th"),
            "urgency_level": urgency_score,
            "urgency_label": urgency_label,
            "masked_client_statement": masked_text,
            "recommended_statutes": [s.get("law_title") for s in cat_data.get("statutes", [])],
            "relevant_precedents": [j.get("case_no") for j in cat_data.get("supreme_court_judgments", [])],
            "required_documents": cat_data.get("evidence_checklist", []),
            "lawyer_action_required": "ตรวจพยานหลักฐาน ร่างหนังสือ Notice หรือเตรียมยื่นคำฟ้อง"
        }

    def _build_fallback_response(self, masked_text: str) -> Dict[str, Any]:
        """
        Handles queries outside the 11 categories or ambiguous queries.
        Provides high-level direction and triggers lawyer handoff.
        """
        return {
            "tier": "Tier 1: Fallback (Unmatched / Specialized Case)",
            "confidence": 0.20,
            "matched_category_id": "CAT-SPECIALIZED",
            "category_name": "คดีเฉพาะทาง / ข้อพิพาททั่วไป",
            "urgency": {
                "score": 1,
                "label": "🟡 ต้องพิจารณาข้อเท็จจริงเฉพาะทาง"
            },
            "consultation_parts": [
                {
                    "step": 1,
                    "title": "📌 สรุปประเด็นข้อกฎหมาย",
                    "content": "กรณีของท่านอาจเป็นประเด็นกฎหมายเฉพาะทาง (เช่น กฎหมายที่ดินซับซ้อน, ภาษีศุลกากร, ทรัพย์สินทางปัญญา, หรือคดีปกครอง) ซึ่งจำเป็นต้องพิจารณาข้อเท็จจริงและเอกสารสัญญาอย่างละเอียด"
                },
                {
                    "step": 2,
                    "title": "⚖️ หลักการคุ้มครองสิทธิเบื้องต้น",
                    "content": "ท่านมีสิทธิขั้นพื้นฐานตามรัฐธรรมนูญและกฎหมายวิธีพิจารณาความ ในการโต้แย้งสิทธิ อุทธรณ์คำสั่ง หรือยื่นคำร้องขอความเป็นธรรมต่อหน่วยงานที่มีอำนาจหน้าที่กำกับดูแลโดยตรง"
                },
                {
                    "step": 3,
                    "title": "🚀 ขั้นตอนที่ต้องปฏิบัติทันที",
                    "content": "1. รวบรวมเอกสาร หนังสือสัญญา หรือหนังสือแจ้งคำสั่งจากหน่วยงานราชการ/คู่กรณีทั้งหมด\n2. ตรวจสอบกรอบเวลาการยื่นอุทธรณ์หรือโต้แย้ง (โดยทั่วไปมักมีกรอบเวลา 15 วัน, 30 วัน หรือ 60 วัน)\n3. ปรึกษาทนายความวิชาชีพเฉพาะทางเพื่อวางรูปคดีก่อนหมดอายุความ"
                },
                {
                    "step": 4,
                    "title": "👨‍⚖️ ส่งต่อทนายความพาร์ตเนอร์ผู้เชี่ยวชาญเฉพาะทาง",
                    "content": "เนื่องจากคดีนี้มีความซับซ้อนเฉพาะด้าน แนะนำให้ส่งต่อข้อเท็จจริงให้ **ทนายความพาร์ตเนอร์ผู้เชี่ยวชาญเฉพาะด้าน** ช่วยตรวจเอกสารและให้คำปรึกษาเชิงลึก\n\n👉 ท่านสามารถกดปุ่ม **'นัดหมายปรึกษาทนายความเฉพาะทาง'** ได้ทันที"
                }
            ],
            "partner_lawyer_brief": {
                "brief_status": "SPECIALIZED_HANDOFF",
                "category_id": "CAT-SPECIALIZED",
                "category_name": "คดีเฉพาะทาง",
                "masked_client_statement": masked_text,
                "lawyer_action_required": "ต้องการทนายความเฉพาะทางสัมภาษณ์ข้อเท็จจริงเพิ่มเติม"
            },
            "tokens_consumed": 0,
            "cost_thb": 0.0
        }
