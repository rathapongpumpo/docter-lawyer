from app.contracts.extract import Page, clean, find_parties, segment

CONTRACT = """สัญญาจ้างทำของ
ระหว่าง บริษัท เอ็กซ์ก่อสร้าง จำกัด ต่อไปนี้เรียกว่า "ผู้ว่าจ้าง" กับ บริษัท วายเทค จำกัด ต่อไปนี้เรียกว่า "ผู้รับจ้าง"
ข้อ 1 วัตถุแห่งสัญญา
ผู้รับจ้างตกลงทำงานติดตั้งระบบตามใบเสนอราคา
ข้อ 2. ค่าจ้างและการชำระเงิน
ค่าจ้าง 500,000 บาท ชำระภายใน 30 วัน
2.1 ชำระงวดสุดท้ายเมื่อตรวจรับงาน
ข้อ ๓ ค่าปรับ
หากส่งมอบล่าช้า ผู้รับจ้างยอมให้ปรับวันละ 20,000 บาท"""


def test_segments_thai_clauses_with_sub_clauses_kept_inside():
    clauses = segment([Page(1, CONTRACT)])
    assert [c.ref for c in clauses] == ["ส่วนต้น", "ข้อ 1", "ข้อ 2", "ข้อ 3"]
    assert clauses[2].title == "ค่าจ้างและการชำระเงิน"
    assert "2.1 ชำระงวดสุดท้าย" in clauses[2].text
    assert "20,000" in clauses[3].text and clauses[3].ref == "ข้อ 3"  # Thai digit normalised in the ref


def test_clause_page_is_where_it_starts():
    p1 = "ข้อ 1 ขอบเขต\nงานทั้งหมด"
    p2 = "ข้อ 2 ราคา\n100 บาท"
    assert [(c.ref, c.page) for c in segment([Page(1, p1), Page(2, p2)])] == [("ข้อ 1", 1), ("ข้อ 2", 2)]


def test_english_clauses_and_plain_numbering_fallback():
    en = segment([Page(1, "Article 1 Scope\nWork.\nArticle 2 Price\nTen.")])
    assert [c.ref for c in en] == ["Article 1", "Article 2"]
    plain = segment([Page(1, "1. ขอบเขต\nงาน\n2. ราคา\nสิบ\n3. เวลา\nวัน")])
    assert [c.ref for c in plain] == ["ข้อ 1", "ข้อ 2", "ข้อ 3"]


def test_unstructured_text_stays_whole_instead_of_guessing():
    clauses = segment([Page(1, "ข้อตกลงฉบับนี้ทำขึ้นเพื่อ\nไม่มีเลขข้อ\nเป็นข้อความต่อเนื่อง")])
    assert [c.ref for c in clauses] == ["เนื้อหาทั้งฉบับ"] or clauses == []


def test_party_hint_and_thai_cleanup():
    assert find_parties([Page(1, CONTRACT)]) == ["บริษัท เอ็กซ์ก่อสร้าง จำกัด", "บริษัท วายเทค จำกัด"]
    assert clean("ทํางาน​") == "ทำงาน"


def test_shifted_thai_glyphs_from_private_use_area_are_restored():
    # what pypdf returns for a PDF set in TH Sarabun New: tone marks drawn as U+F70A/F70B/F705/F70E variants
    raw = "ข\uf70bอ 1 ค\uf70aาจ\uf70bาง ระหว\uf70aาง ฝ\uf705าย เอ็กซ\uf70e \uf7ff"
    assert clean(raw) == "ข้อ 1 ค่าจ้าง ระหว่าง ฝ่าย เอ็กซ์"
    assert "\uf70b" not in clean(raw) and "\uf7ff" not in clean(raw)
    assert [c.ref for c in segment([Page(1, clean("ข\uf70bอ 1 ขอบเขต\nงาน\nข\uf70bอ 2 ราคา\nสิบ"))])] == ["ข้อ 1", "ข้อ 2"]
