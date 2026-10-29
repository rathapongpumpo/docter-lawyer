from app.kb.importer import render_plain
from app.kb.rebuild import _sections

MD = """# ค่าปรับส่งงานช้า

ภาพรวม

## สรุปสั้น
ผู้ว่าจ้างปรับได้ตามสัญญา [[law:ccc:383]] แต่ศาลลดได้

## เมื่อไรควรปรึกษาทนายความ
ถ้าจำนวนสูงมาก

## ฐานกฎหมาย
ข้อความที่ต้องข้าม
"""


def test_refs_are_rendered_as_readable_text_for_search():
    assert (
        render_plain("ดู [[law:ccc:383]] และ [[guide:x]]", {"ccc": "ป.พ.พ."}, {("guide", "x"): "คู่มือ X"})
        == "ดู (ป.พ.พ. มาตรา 383) และ “คู่มือ X”"
    )


def test_sections_become_chunks_with_the_same_shape_as_the_importer():
    chunks = _sections(
        MD,
        "ค่าปรับส่งงานช้า",
        "late-penalty",
        "/guides/late-penalty",
        ("guide", 7, 2),
        [27],
        "คู่มือ: ",
        False,
        "draft",
        {"ccc": "ป.พ.พ."},
        {},
        skip=("ฐานกฎหมาย",),
    )
    assert [c.title for c in chunks] == ["คู่มือ: ค่าปรับส่งงานช้า › สรุปสั้น", "คู่มือ: ค่าปรับส่งงานช้า › เมื่อไรควรปรึกษาทนายความ"]
    assert "(ป.พ.พ. มาตรา 383)" in chunks[0].content and "[[" not in chunks[0].content
    assert chunks[0].metadata["url"] == "/guides/late-penalty" and chunks[0].metadata["status"] == "draft"
    assert (chunks[0].source_type, chunks[0].source_id, chunks[0].source_version, chunks[0].is_published) == (
        "guide",
        7,
        2,
        False,
    )
