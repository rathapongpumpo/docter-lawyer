import { describe, expect, it } from 'vitest';
import { expandRefs, sectionPath, splitParagraphs, toArabic } from '@/lib/kb-refs';

const labels = {
  laws: { ccc: 'ป.พ.พ.' },
  guides: { 'respond-to-penalty-deduction': 'รับมือเมื่อถูกหักค่าปรับ' },
  templates: {},
  articles: { 'late-delivery-penalty': 'ส่งงานช้าแล้วโดนปรับ' },
  section: (law: string, s: string, p: number | null) => `${law} ม.${s}${p ? ` วรรค${p}` : ''}`,
  guide: (title: string) => `คู่มือ “${title}”`,
  template: (title: string) => `แบบหนังสือ “${title}”`,
};

describe('expandRefs', () => {
  it('turns statute, guide and article refs into in-app links', () => {
    const md = 'ดู [[law:ccc:381#p3]] และ [[law:ccc:๑๙๓/๓๔]] ใช้ [[guide:respond-to-penalty-deduction]] (slug `x`)';
    expect(expandRefs(md, labels)).toBe(
      'ดู [ป.พ.พ. ม.381 วรรค3](/law/ccc/381#p3) และ [ป.พ.พ. ม.193/34](/law/ccc/193/34) ใช้ [คู่มือ “รับมือเมื่อถูกหักค่าปรับ”](/guides/respond-to-penalty-deduction)',
    );
  });

  it('keeps terms as text and drops refs that point nowhere', () => {
    expect(expandRefs('[[term:เบี้ยปรับ]] [[template:missing]] - [ ] สัญญา (`contract`)', labels)).toBe('เบี้ยปรับ  - [ ] สัญญา');
  });
});

describe('statute helpers', () => {
  it('encodes section paths and splits paragraphs', () => {
    expect(sectionPath('ccc', '4 ทวิ')).toBe('/law/ccc/4%20%E0%B8%97%E0%B8%A7%E0%B8%B4');
    expect(toArabic('๓๘๑')).toBe('381');
    expect(splitParagraphs('วรรคแรก\n\n(๑) ข้อหนึ่ง\n\nวรรคสอง')).toEqual(['วรรคแรก\n(๑) ข้อหนึ่ง', 'วรรคสอง']);
  });
});
