"""Keyword prefilters that run before retrieval (docs/03-technical-spec.md §4.4, §4.2 `out_of_scope`).

- Safety: urgent/dangerous situations always get a `safety_notice` (CLAUDE.md §2.1 rule 5). Messages here are general
  safety guidance only. Phone numbers must come from verified kb.help_agencies rows (§4.4) — none are verified yet,
  so `contacts` stays empty until the M9 data is reviewed.
- Scope: the Phase-1 knowledge base covers commercial contracts only. Strong signals of another area of law are
  answered as out of scope instead of letting a similar-sounding contract article answer (e.g. an employee's
  "เลิกจ้าง" is labour law, not hire of work).
"""

import re
from dataclasses import dataclass

# ---------------------------------------------------------------- safety
_SAFETY: dict[str, tuple[str, list[str]]] = {
    "self_harm": ("urgent", ["อยากตาย", "ฆ่าตัวตาย", "ไม่อยากมีชีวิต", "ไม่อยากอยู่แล้ว", "ทำร้ายตัวเอง", "จบชีวิต",
                             "suicide", "kill myself"]),
    "domestic_violence": ("urgent", ["ความรุนแรงในครอบครัว", "สามีทำร้าย", "ภรรยาทำร้าย", "แฟนทำร้าย", "ถูกตบตี",
                                     "โดนตบตี", "ทุบตี", "ถูกขังไว้", "โดนขังไว้"]),
    "threat_violence": ("urgent", ["ขู่ฆ่า", "ขู่จะฆ่า", "ขู่ทำร้าย", "ขู่จะทำร้าย", "ถูกข่มขู่", "โดนข่มขู่",
                                   "ตามคุกคาม", "death threat"]),
    "child_abuse": ("urgent", ["ทำร้ายเด็ก", "ทารุณเด็ก", "ล่วงละเมิดเด็ก", "ทำร้ายลูก", "child abuse"]),
    "arrest_detention": ("caution", ["ถูกจับ", "โดนจับ", "ถูกควบคุมตัว", "ตำรวจจับ", "หมายจับ", "ถูกคุมขัง",
                                     "arrested"]),
    "scam_in_progress": ("caution", ["กำลังโอนเงิน", "กำลังจะโอน", "แก๊งคอลเซ็นเตอร์", "คอลเซ็นเตอร์หลอก",
                                     "อ้างเป็นตำรวจ", "หลอกให้โอน", "หลอกโอน"]),
    "deadline_imminent": ("caution", ["พรุ่งนี้ต้องไปศาล", "นัดศาลพรุ่งนี้", "ได้รับหมายเรียก", "ได้หมายศาล",
                                      "ได้รับหมายศาล", "ใกล้หมดอายุความ", "จะหมดอายุความ", "ครบกำหนดยื่น",
                                      "court tomorrow", "summons"]),
}

_SAFETY_MESSAGE: dict[str, dict[str, str]] = {
    "self_harm": {"th": "ถ้าคุณกำลังคิดทำร้ายตัวเอง คุณไม่ได้อยู่คนเดียว โปรดติดต่อคนที่คุณไว้ใจ "
                        "หรือไปโรงพยาบาลใกล้บ้านเพื่อขอความช่วยเหลือทันที",
                  "en": "If you are thinking about harming yourself, you are not alone. Please reach out to someone "
                        "you trust or go to the nearest hospital now."},
    "domestic_violence": {"th": "หากคุณกำลังตกอยู่ในอันตราย ให้ไปอยู่ในที่ปลอดภัยและติดต่อเจ้าหน้าที่ตำรวจทันที "
                                "และเก็บหลักฐานการถูกทำร้ายไว้",
                          "en": "If you are in danger, get to a safe place and contact the police now. "
                                "Keep evidence of the harm."},
    "threat_violence": {"th": "หากคุณถูกข่มขู่ว่าจะถูกทำร้าย ให้ติดต่อเจ้าหน้าที่ตำรวจโดยเร็ว "
                              "และเก็บหลักฐานการข่มขู่ไว้ทั้งหมด",
                        "en": "If you have been threatened with harm, contact the police quickly and keep all "
                              "evidence of the threats."},
    "child_abuse": {"th": "หากเด็กกำลังตกอยู่ในอันตราย ให้ติดต่อเจ้าหน้าที่ตำรวจหรือหน่วยงานคุ้มครองเด็กทันที",
                    "en": "If a child is in danger, contact the police or child-protection services now."},
    "arrest_detention": {"th": "เรื่องการถูกจับหรือถูกควบคุมตัวเป็นเรื่องเร่งด่วน ควรติดต่อทนายความ "
                               "หรือหน่วยงานช่วยเหลือทางกฎหมายโดยเร็วที่สุด",
                         "en": "Arrest or detention is urgent. Contact a lawyer or a legal-aid service as soon as "
                               "possible."},
    "scam_in_progress": {"th": "หากคุณกำลังถูกกดดันให้โอนเงิน ให้หยุดก่อน แล้วติดต่อธนาคารของคุณผ่านช่องทางทางการทันที",
                         "en": "If you are being pressed to transfer money, stop and contact your bank through its "
                               "official channels now."},
    "deadline_imminent": {"th": "เรื่องที่มีกำหนดเวลาใกล้ถึง เช่น วันนัดศาล หมายเรียก หรืออายุความ "
                                "ควรปรึกษาทนายความโดยเร็ว เพราะการพ้นกำหนดอาจทำให้เสียสิทธิ",
                          "en": "With a deadline close — a court date, a summons or a limitation period — consult a "
                                "lawyer quickly; missing it may cost you your rights."},
}


@dataclass(frozen=True)
class SafetyHit:
    category: str
    level: str  # urgent | caution
    keyword: str

    def notice(self, locale: str) -> dict:
        msg = _SAFETY_MESSAGE[self.category]
        return {"level": self.level, "category": self.category, "message": msg.get(locale) or msg["th"],
                "contacts": []}


def safety_triage(text: str) -> SafetyHit | None:
    lowered = text.lower()
    best: SafetyHit | None = None
    for category, (level, words) in _SAFETY.items():
        for w in words:
            if w in lowered:
                hit = SafetyHit(category, level, w)
                if best is None or (hit.level == "urgent" and best.level != "urgent"):
                    best = hit
                break
    return best


# ---------------------------------------------------------------- scope
# explicit commercial-contract roles/terms (hire of work, sale) — these keep even a labour-sounding question in scope
_STRONG_CONTRACT = re.compile(r"ผู้รับเหมา|รับเหมา|ผู้รับจ้าง|ผู้ว่าจ้าง|จ้างทำของ|ซัพพลายเออร์|ผู้ขาย|ผู้ซื้อ|เบี้ยปรับ|มัดจำ")
_CONTRACT_SIGNALS = re.compile(_STRONG_CONTRACT.pattern + r"|สัญญา|ค่างวด|ส่งมอบ|ตรวจรับ")
_STRONG_OOS = {"LABOR"}  # "สัญญาจ้างงาน" with an employer is still labour law
_OUT_OF_SCOPE: dict[str, list[str]] = {
    "LABOR": ["นายจ้าง", "ลูกจ้าง", "ค่าชดเชย", "ประกันสังคม", "เงินเดือน", "ไล่ออกจากงาน", "ลาออก", "ค่าล่วงเวลา"],
    "FAMILY": ["หย่า", "จดทะเบียนสมรส", "สินสมรส", "ค่าเลี้ยงดู", "อำนาจปกครองบุตร", "สามี", "ภรรยา"],
    "INHERIT": ["มรดก", "พินัยกรรม", "ทายาท", "ผู้จัดการมรดก"],
    "CRIMINAL": ["แจ้งความ", "ตำรวจ", "คดีอาญา", "ประกันตัว", "ติดคุก", "จำคุก"],
    "TRAFFIC": ["ใบสั่ง", "จราจร", "ใบขับขี่", "เมาแล้วขับ", "ชนรถ", "รถชน"],
    "TAX": ["ภาษีเงินได้", "สรรพากร", "ยื่นภาษี", "ภาษีที่ดิน"],
    "DIGITAL": ["pdpa", "ข้อมูลส่วนบุคคล", "โดนแฮก", "พ.ร.บ.คอมพิวเตอร์"],
}


def out_of_scope(text: str) -> str | None:
    """Category code of a clearly different area of law, unless the text is also about a contract."""
    lowered = text.lower()
    strong, weak = bool(_STRONG_CONTRACT.search(lowered)), bool(_CONTRACT_SIGNALS.search(lowered))
    for code, words in _OUT_OF_SCOPE.items():
        if any(w in lowered for w in words) and not (strong if code in _STRONG_OOS else weak):
            return code
    return None
