import { describe, expect, it } from 'vitest';
import { tokensMatch } from '@/lib/csrf';

describe('tokensMatch', () => {
  it('accepts identical tokens', () => expect(tokensMatch('abc123', 'abc123')).toBe(true));
  it('rejects missing or different tokens', () => {
    expect(tokensMatch(undefined, 'abc')).toBe(false);
    expect(tokensMatch('abc', null)).toBe(false);
    expect(tokensMatch('abc', 'abd')).toBe(false);
    expect(tokensMatch('abc', 'abcd')).toBe(false);
  });
});
