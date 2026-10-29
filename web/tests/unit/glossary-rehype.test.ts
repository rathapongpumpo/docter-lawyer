import { describe, expect, it } from 'vitest';
import { rehypeGlossary } from '@/lib/glossary-rehype';

const text = (value: string) => ({ type: 'text', value });
const el = (tagName: string, ...children: object[]) => ({ type: 'element', tagName, properties: {}, children });
const run = (tree: object, opts: Parameters<typeof rehypeGlossary>[0]) => { rehypeGlossary(opts)(tree as never); return tree as { children: { type: string; value?: string; tagName?: string; properties?: Record<string, unknown>; children?: { value?: string }[] }[] }; };
const ENTRIES = [
  { slug: 'limitation', terms: ['อายุความ'], def: 'd1' },
  { slug: 'interruption', terms: ['อายุความสะดุดหยุดลง'], def: 'd2' },
  { slug: 'penalty', terms: ['เบี้ยปรับ', 'ค่าปรับ'], def: 'd3' },
];

describe('rehypeGlossary', () => {
  it('wraps only the first mention of a term and prefers the longest match', () => {
    const tree = run(el('p', text('อายุความสะดุดหยุดลง และอายุความ ทั้งสอง อายุความ')), { entries: ENTRIES });
    const spans = tree.children.filter((n) => n.tagName === 'span') as unknown as { properties: { dataGlossary: string }; children: { value: string }[] }[];
    expect(spans.map((s) => [s.properties.dataGlossary, s.children[0].value])).toEqual([['interruption', 'อายุความสะดุดหยุดลง'], ['limitation', 'อายุความ']]);
  });

  it('leaves links, code and headings alone and can skip the page\'s own term', () => {
    const tree = run({ type: 'root', children: [el('a', text('เบี้ยปรับ')), el('code', text('เบี้ยปรับ')), el('h2', text('เบี้ยปรับ')), el('p', text('เบี้ยปรับ'))] }, { entries: ENTRIES });
    expect(JSON.stringify(tree.children.slice(0, 3))).not.toContain('dataGlossary');
    expect(JSON.stringify(tree.children[3])).toContain('penalty');
    const own = run(el('p', text('เบี้ยปรับ')), { entries: ENTRIES, skip: ['penalty'] });
    expect(JSON.stringify(own)).not.toContain('dataGlossary');
  });

  it('does nothing without entries and does not cut Latin words', () => {
    const t = el('p', text('abc'));
    expect(run(t, { entries: [] }).children).toEqual([{ type: 'text', value: 'abc' }]);
    const latin = run(el('p', text('xNDAx NDA')), { entries: [{ slug: 'nda', terms: ['NDA'], def: '' }] });
    expect(JSON.stringify(latin).match(/dataGlossary/g)?.length).toBe(1);
  });
});
