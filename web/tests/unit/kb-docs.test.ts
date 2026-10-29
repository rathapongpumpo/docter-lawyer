import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { letterOf } from '@/lib/glossary-letters';
import { guideKeys, parseGuide } from '@/lib/guide-doc';
import { emptyFieldCount, formatThaiDate, pageOf, parseTemplate, toLines } from '@/lib/template-doc';

const KB = join(__dirname, '../../../docs/knowledge-base');
const kb = (dir: string) => readdirSync(join(KB, dir)).filter((f) => f.endsWith('.md')).map((f) => [f, readFileSync(join(KB, dir, f), 'utf8')] as const);

describe('parseGuide', () => {
  it('finds the document checklist and numbered steps of every guide in the knowledge base', () => {
    for (const [file, md] of kb('guides')) {
      const segs = parseGuide(md);
      const docs = segs.find((s) => s.type === 'docs');
      const steps = segs.find((s) => s.type === 'steps');
      expect(docs, file).toBeTruthy();
      expect(steps, file).toBeTruthy();
      const keys = guideKeys(segs);
      expect(new Set(keys).size, `${file} keys unique`).toBe(keys.length);
    }
  });

  it('reads keys from the backticks, numbers the steps, keeps nested lines with their step', () => {
    const segs = parseGuide('# T\n\n## เอกสาร\n- [ ] สัญญา (`contract`)\n- [ ] ไม่มีคีย์\n\n## ขั้นตอน\n1. **ก**\n   - ย่อย\n2. **ข** ตัวเอียง\n\n## ท้าย\nจบ');
    expect(segs.map((s) => s.type)).toEqual(['md', 'docs', 'md', 'steps', 'md']);
    expect(guideKeys(segs)).toEqual(['contract', 'doc-2', 'step-1', 'step-2']);
    const steps = segs[3] as { items: { md: string }[] };
    expect(steps.items[0].md).toBe('**ก**\n- ย่อย');
  });

  it('leaves a guide without a checklist as plain text', () => {
    expect(parseGuide('## ภาพรวม\nเนื้อหา')).toEqual([{ type: 'md', md: '## ภาพรวม\nเนื้อหา' }]);
  });
});

describe('parseTemplate', () => {
  it('turns every letter template in the knowledge base into a form with its own fields', () => {
    for (const [file, md] of kb('templates')) {
      const form = parseTemplate(md);
      expect(form, file).not.toBeNull();
      expect(form!.fields.length, file).toBeGreaterThanOrEqual(8);
      expect(form!.fields.map((f) => f.key)).toEqual(form!.fields.map((_, i) => `f${i + 1}`));
      // every bracket must have become a field: with nothing filled in, only "[label]" placeholders remain
      const blank = toLines(form!, {}).join('\n').replace(/\[[^\]\n]+\]/g, '');
      expect(blank, file).not.toMatch(/[[\]]/);
    }
  });

  const md = '## ช่องที่ต้องกรอก\n- [วันที่] [ชื่อ]\n- [ระยะเวลา] (ไม่มีจำนวนวัน [[law:ccc:387]])\n\n## ตัวหนังสือ\n```text\nวันที่ [วันที่]\nเรียน [ชื่อ] ตามที่ [ชื่อ] แจ้ง\nภายใน [ระยะเวลา] [รายละเอียด เช่น สินค้าล็อต 1]\n```\n';

  it('shares one field between repeated labels, splits "เช่น" into a hint and picks the input kind', () => {
    const form = parseTemplate(md)!;
    expect(form.fields.map((f) => [f.label, f.kind, f.hint])).toEqual([
      ['วันที่', 'date', null], ['ชื่อ', 'text', null], ['ระยะเวลา', 'text', null], ['รายละเอียด', 'textarea', 'เช่น สินค้าล็อต 1'],
    ]);
    expect(form.fields[2].help).toBe('ไม่มีจำนวนวัน [[law:ccc:387]]');
  });

  it('fills answers, formats dates in the Buddhist era and keeps unanswered fields visible', () => {
    const form = parseTemplate(md)!;
    const lines = toLines(form, { f1: '2026-09-24', f2: 'บริษัท ก', f4: 'บรรทัด 1\nบรรทัด 2' });
    expect(lines).toEqual(['วันที่ 24 กันยายน 2569', 'เรียน บริษัท ก ตามที่ บริษัท ก แจ้ง', 'ภายใน [ระยะเวลา] บรรทัด 1', 'บรรทัด 2']);
    expect(emptyFieldCount(form, { f2: 'x' })).toBe(3);
  });

  it('leaves out an optional "[ถ้ามี: …]" sentence until its field is answered', () => {
    const opt = '## ตัวหนังสือ\n```text\nเรียน [ชื่อ]\n[ถ้ามี: และขอทักท้วง [ความชำรุด]]\nจบ\n```\n';
    const form = parseTemplate(opt)!;
    expect(form.fields.map((f) => [f.label, f.optional])).toEqual([['ชื่อ', false], ['ความชำรุด', true]]);
    expect(toLines(form, { f1: 'ก' })).toEqual(['เรียน ก', '', 'จบ']);
    expect(toLines(form, { f1: 'ก', f2: 'จอแตก' })).toEqual(['เรียน ก', 'และขอทักท้วง จอแตก', 'จบ']);
    expect(emptyFieldCount(form, {})).toBe(1);
  });

  it('drops control characters from answers and pages fields five at a time', () => {
    const form = parseTemplate(md)!;
    expect(toLines(form, { f2: 'a\u0000b\u001bc' })[1]).toBe('เรียน abc ตามที่ abc แจ้ง');
    expect(pageOf([1, 2, 3, 4, 5, 6, 7]).map((p) => p.length)).toEqual([5, 2]);
  });

  it('keeps text that is not an ISO date as typed', () => {
    expect(formatThaiDate('2026-01-05')).toBe('5 มกราคม 2569');
    expect(formatThaiDate('ต้นเดือนหน้า')).toBe('ต้นเดือนหน้า');
    expect(formatThaiDate('2026-13-01')).toBe('2026-13-01');
  });
});

describe('letterOf', () => {
  it('files Thai terms under the first consonant, skipping a leading vowel sign', () => {
    expect(letterOf('เลิกสัญญา')).toBe('ล');
    expect(letterOf('มัดจำ')).toBe('ม');
    expect(letterOf('ไม่เป็นธรรม')).toBe('ม');
    expect(letterOf('(ข้อ) สัญญา')).toBe('ข');
    expect(letterOf('nda')).toBe('N');
  });
});
