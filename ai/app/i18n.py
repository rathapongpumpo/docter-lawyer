"""Server-side strings sent inside SSE events (status texts, guardrail notices)."""

STATUS_TEXT: dict[str, dict[str, str]] = {
    "analyzing": {"th": "กำลังวิเคราะห์คำถาม…", "en": "Analyzing your question…"},
    "retrieving": {"th": "กำลังค้นหาตัวบทและบทความที่เกี่ยวข้อง…", "en": "Searching laws and articles…"},
    "generating": {"th": "กำลังเรียบเรียงคำตอบ…", "en": "Writing the answer…"},
    "verifying": {"th": "กำลังตรวจสอบการอ้างอิง…", "en": "Verifying citations…"},
}

UNAVAILABLE = {
    "th": {"title": "บริการตอบคำถามยังไม่พร้อม", "text": "ระบบค้นคลังความรู้ยังไม่พร้อม กรุณาลองใหม่ภายหลัง"},
    "en": {"title": "Answering service unavailable",
           "text": "The knowledge-base search is not ready. Please try again later."},
}

ERRORS = {
    "chat_not_found": {"th": "ไม่พบแชทนี้", "en": "Chat not found"},
    "internal": {"th": "เกิดข้อผิดพลาด กรุณาลองใหม่", "en": "Something went wrong. Please try again."},
}


def pick(table: dict[str, str], locale: str) -> str:
    return table.get(locale) or table["th"]


def status_text(status: str, locale: str) -> str:
    return pick(STATUS_TEXT[status], locale)
