"""Section numbers named in a query (FR-KB-010): with or without "มาตรา", Thai digits, dotted abbreviations."""

import pytest

from app.rag.retrieve import parse_section_refs

LAWS = [
    {"law_code": "ccc", "aliases": ["ปพพ", "ป.พ.พ.", "CCC"], "short_name_th": "ป.พ.พ."},
    {"law_code": "cpc", "aliases": ["ปวพ", "ป.วิ.พ."], "short_name_th": "ป.วิ.พ."},
]


@pytest.mark.parametrize("query,expected", [
    ("ปพพ 420", [("ccc", "420")]),
    ("ป.พ.พ. มาตรา 420", [("ccc", "420")]),
    ("ม.420 ปพพ", [("ccc", "420")]),
    ("CCC 420", [("ccc", "420")]),
    ("ปพพ ๑๓๓๖/๑", [("ccc", "1336/1")]),
    ("ปพพ มาตรา 4 ทวิ", [("ccc", "4 ทวิ")]),
    ("มาตรา 420", [(None, "420")]),
    ("ปพพ 383 และ ปวพ 4", [("ccc", "383"), ("cpc", "4")]),
    ("ค่าปรับส่งช้า 20 วัน", []),
])
def test_parse_section_refs(query, expected):
    assert parse_section_refs(query, LAWS) == expected
