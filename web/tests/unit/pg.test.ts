import { describe, expect, it } from 'vitest';
import { pgArray } from '@/lib/pg';

describe('pgArray', () => {
  it('builds array literals, including the empty one', () => {
    expect(pgArray([])).toBe('{}');
    expect(pgArray(['CONTRACT', 'LABOR'])).toBe('{"CONTRACT","LABOR"}');
  });
  it('escapes quotes and backslashes so a value cannot break out of its element', () => {
    expect(pgArray(['a"b', 'c\\d', 'x},{y'])).toBe('{"a\\"b","c\\\\d","x},{y"}');
  });
});
