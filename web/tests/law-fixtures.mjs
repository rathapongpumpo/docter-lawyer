// Builds a statute PDF laid out like an official gazette file (wrapped lines, running headers and page numbers in the text flow)
// from web/test-results/law/sections.json, using TH Sarabun New so the text layer has the same private-use glyph quirks as real PDFs.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const dir = process.env.FIXTURE_DIR ?? 'test-results/law';
const sections = JSON.parse(readFileSync(`${dir}/sections.json`, 'utf8'));
let n = 0;
const body = [];
sections.forEach((s, i) => {
  const paras = s.body.split(/\n\n+/);
  body.push(`<p class="sec"><b>มาตรา ${s.no}</b>  ${paras[0].replaceAll('\n', ' ')}</p>`);
  for (const p of paras.slice(1)) body.push(`<p>${p.replaceAll('\n', '<br>')}</p>`);
  if (i % 4 === 3) {
    n += 1;
    body.push(`<div class="furn">ราชกิจจานุเบกษา เล่ม ๑๓๘ ตอนที่ ๔๕ ก</div><div class="furn">- ${n} -</div>`);
  }
});
const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>
@font-face { font-family: 'TH Sarabun New'; src: url('${process.cwd()}/app/fonts/THSarabunNew-Regular.woff2') format('woff2'); font-weight: 400; }
@font-face { font-family: 'TH Sarabun New'; src: url('${process.cwd()}/app/fonts/THSarabunNew-Bold.woff2') format('woff2'); font-weight: 700; }
body { font-family: 'TH Sarabun New'; font-size: 20px; line-height: 1.45; margin: 0; }
h1 { text-align: center; } p { margin: 0 0 8px; } .sec { margin-top: 14px; } .furn { text-align: center; color: #555; font-size: 16px; margin: 6px 0; }
</style></head><body><h1>ประมวลกฎหมายแพ่งและพาณิชย์ (ตัวอย่างสำหรับทดสอบ)</h1><div class="furn">หมวด ๑ บททั่วไป</div>${body.join('\n')}</body></html>`;
writeFileSync(`${dir}/law.html`, html);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`file://${process.cwd()}/${dir}/law.html`);
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: `${dir}/law.pdf`, format: 'A4', margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' } });
await browser.close();
console.log('law.pdf written');
