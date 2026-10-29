import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import th from '../../messages/th.json';

type Tree = { [k: string]: string | Tree | Tree[] };
// Arrays (e.g. legal text sections) are walked by index so both languages must have the same number of items.
const asTree = (v: Tree | Tree[]): Tree => (Array.isArray(v) ? Object.fromEntries(v.map((x, i) => [String(i), x])) : v);
const keys = (t: Tree, prefix = ''): string[] =>
  Object.entries(t).flatMap(([k, v]) => (typeof v === 'string' ? [`${prefix}${k}`] : keys(asTree(v), `${prefix}${k}.`)));
const values = (t: Tree): string[] => Object.values(t).flatMap((v) => (typeof v === 'string' ? [v] : values(asTree(v))));

// Every UI string exists in both languages (CLAUDE.md rule 13, NFR-I18N)
describe('messages', () => {
  it('th and en have exactly the same keys', () => {
    expect(keys(en as unknown as Tree).sort()).toEqual(keys(th as unknown as Tree).sort());
  });
  it('has no empty values', () => {
    for (const [name, tree] of [['th', th], ['en', en]] as const) {
      const empty = keys(tree as unknown as Tree).filter((k) => {
        const v = k.split('.').reduce<unknown>((o, part) => (o as Record<string, unknown>)[part], tree);
        return typeof v !== 'string' || v.trim() === '';
      });
      expect({ name, empty }).toEqual({ name, empty: [] });
    }
  });
  it('has no key that contains a dot (next-intl reads a dot as a path, so such a key can never be found)', () => {
    const walk = (t: Tree, path: string): string[] =>
      Object.entries(t).flatMap(([k, v]) => [...(k.includes('.') ? [`${path}${k}`] : []), ...(typeof v === 'string' ? [] : walk(asTree(v), `${path}${k}.`))]);
    expect(walk(th as unknown as Tree, '')).toEqual([]);
    expect(walk(en as unknown as Tree, '')).toEqual([]);
  });
  it('English strings contain no Thai text (except the language names)', () => {
    const thai = values(en as unknown as Tree).filter((v) => /[฀-๿]/.test(v) && v !== 'ไทย');
    expect(thai).toEqual([]);
  });
});
