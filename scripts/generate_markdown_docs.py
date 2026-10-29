"""
Generate human-readable Markdown documentation from legal knowledge JSON files.
Ensures 100% data fidelity between backend JSON and docs/ markdown files.
"""

import json
from pathlib import Path

DATA_DIR = Path("backend/src/data/legal_knowledge").resolve()
DOCS_DIR = Path("docs/legal_knowledge_base").resolve()

def convert_json_to_markdown(json_file: Path, md_file: Path):
    with open(json_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    lines = []
    lines.append(f"# หมวดที่ {data.get('id')}: {data.get('category_name_th')}")
    lines.append(f"**English:** {data.get('category_name_en')}")
    lines.append("")
    lines.append(f"> 📌 **คำอธิบายขอบเขต:** {data.get('description')}")
    lines.append("")

    # Hotlines
    hotlines = data.get("hotlines", [])
    if hotlines:
        lines.append("## 📞 ช่องทางและสายด่วนช่วยเหลือ")
        for h in hotlines:
            num = f" โทร. **{h.get('number')}**" if h.get("number") else ""
            press = f" กด {h.get('press')}" if h.get("press") else ""
            avail = f" ({h.get('available')})" if h.get("available") else ""
            url = f" [ลิงก์เว็บไซต์]({h.get('url')})" if h.get("url") else ""
            lines.append(f"- **{h.get('name')}:**{num}{press}{avail}{url}")
        lines.append("")

    # Keywords
    kws = data.get("keywords", [])
    if kws:
        lines.append("## 🏷️ คำสำคัญที่เกี่ยวข้อง (Trigger Keywords)")
        lines.append("`" + "` · `".join(kws) + "`")
        lines.append("")

    # Statutes
    lines.append("## ⚖️ ตัวบทกฎหมายและมาตราสำคัญ")
    for st in data.get("statutes", []):
        lines.append(f"### 📖 {st.get('law_title')}")
        for sec in st.get("sections", []):
            lines.append(f"#### **{sec.get('section_no')} — {sec.get('title')}**")
            lines.append(f"> {sec.get('text')}")
            lines.append("")
            if sec.get("penalties"):
                lines.append(f"- **อัตราโทษ:** {sec.get('penalties')}")
            if sec.get("civil_consequence"):
                lines.append(f"- **ผลทางแพ่ง:** {sec.get('civil_consequence')}")
            if sec.get("compoundable") is not None:
                comp_str = "เป็นความผิดอันยอมความได้ (ต้องร้องทุกข์ภายใน 3 เดือน)" if sec.get("compoundable") else "เป็นอาญาแผ่นดิน ยอมความไม่ได้"
                lines.append(f"- **ลักษณะความผิด:** {comp_str}")
            if sec.get("statute_of_limitations"):
                lines.append(f"- **อายุความ:** {sec.get('statute_of_limitations')}")
            if sec.get("practical_notes"):
                lines.append(f"- **ข้อสังเกตในทางปฏิบัติ:** {sec.get('practical_notes')}")
            if sec.get("severance_scale"):
                lines.append("- **ตารางอัตราค่าชดเชยตามอายุงาน:**")
                lines.append("  | อายุงาน | อัตราค่าชดเชยที่ได้รับ |")
                lines.append("  | :--- | :--- |")
                for sc in sec.get("severance_scale"):
                    lines.append(f"  | {sc.get('tenure')} | **ไม่น้อยกว่า {sc.get('days')} วัน** |")
            lines.append("")

    # Supreme Court Judgments
    judgments = data.get("supreme_court_judgments", [])
    if judgments:
        lines.append("## 🏛️ คำพิพากษาศาลฎีกาที่สำคัญ (Supreme Court Precedents)")
        for idx, jm in enumerate(judgments, 1):
            lines.append(f"### {idx}. {jm.get('case_no')}")
            lines.append(f"- **ประเด็นข้อพิพาท:** {jm.get('issue')}")
            lines.append(f"- **คำวินิจฉัยของศาลฎีกา:** {jm.get('ruling')}")
            lines.append(f"- **💡 บรรทัดฐานทางกฎหมาย:** *\"{jm.get('core_principle')}\"*")
            lines.append("")

    # Evidence Checklist
    evs = data.get("evidence_checklist", [])
    if evs:
        lines.append("## 📁 รายการพยานหลักฐานที่ต้องจัดเตรียม (Evidence Checklist)")
        for ev in evs:
            lines.append(f"- [ ] {ev}")
        lines.append("")

    # Navigation back
    lines.append("---")
    lines.append("[⬅️ กลับสู่สารบัญคลังกฎหมาย](README.md)")

    with open(md_file, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print(f"Generated: {md_file.name}")


def main():
    json_files = sorted(DATA_DIR.glob("*.json"))
    for jf in json_files:
        if jf.name == "index.json":
            continue
        md_name = jf.stem + ".md"
        md_file = DOCS_DIR / md_name
        convert_json_to_markdown(jf, md_file)

    print("All 10 Markdown files generated successfully!")


if __name__ == "__main__":
    main()
