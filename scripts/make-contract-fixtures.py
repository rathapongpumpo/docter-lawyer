"""Fixtures for the contract E2E (scripts/e2e-contract.sh): a DOCX contract, an infected DOCX (EICAR inside the zip),
an encrypted PDF, a text file pretending to be a PDF, and a PDF with too many pages. Runs inside the ai image."""

import sys
import zipfile
from pathlib import Path

from docx import Document
from pypdf import PdfReader, PdfWriter

out = Path(sys.argv[1])
doc = Document()
doc.add_heading("สัญญาซื้อขายสินค้า", 1)
doc.add_paragraph('สัญญาฉบับนี้ทำขึ้นระหว่าง บริษัท ซีซัพพลาย จำกัด ต่อไปนี้เรียกว่า "ผู้ขาย" กับ บริษัท ดีเทรด จำกัด ต่อไปนี้เรียกว่า "ผู้ซื้อ"')
doc.add_paragraph("ข้อ 1 สินค้า\nผู้ขายตกลงขายอุปกรณ์ไฟฟ้าตามรายการแนบท้าย")
doc.add_paragraph("ข้อ 2 ราคาและการชำระเงิน\nราคารวม 200,000 บาท ชำระภายใน 15 วันนับแต่วันรับสินค้า")
doc.add_paragraph("ข้อ 3 การรับประกัน\nผู้ขายรับประกันความชำรุดบกพร่องเป็นเวลา 6 เดือน")
table = doc.add_table(rows=1, cols=2)
table.rows[0].cells[0].text = "รายการ"
table.rows[0].cells[1].text = "จำนวน 100 ชุด"
doc.save(out / "contract.docx")

# EICAR test string (harmless, recognised by every scanner) hidden inside a valid DOCX; built from pieces so this file is not itself flagged
eicar = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$" + "EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
with zipfile.ZipFile(out / "contract.docx") as src, zipfile.ZipFile(out / "infected.docx", "w", zipfile.ZIP_DEFLATED) as dst:
    for item in src.infolist():
        dst.writestr(item, src.read(item.filename))
    dst.writestr("customXml/eicar.com", eicar)

reader = PdfReader(out / "contract.pdf")
enc = PdfWriter()
for p in reader.pages:
    enc.add_page(p)
enc.encrypt("secret-pw")
with open(out / "encrypted.pdf", "wb") as f:
    enc.write(f)

(out / "notes.pdf").write_text("this is a plain text file with a .pdf name", encoding="utf-8")

many = PdfWriter()
for _ in range(51):
    many.add_blank_page(width=200, height=200)
with open(out / "many-pages.pdf", "wb") as f:
    many.write(f)
(out / "big.pdf").write_bytes(b"%PDF-1.4\n" + b"0" * (21 * 1024 * 1024))
print("ok")
