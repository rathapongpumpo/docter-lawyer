import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { renderEmail } = await import('@/lib/email/templates');
const KINDS = ['verify', 'reset', 'passwordChanged', 'accountLocked', 'deletionRequested', 'deletionCancelled', 'orgInvite', 'counselShare', 'counselReply', 'orgDeletion'] as const;

describe('renderEmail', () => {
  it('renders every notice in Thai and English with a subject and no unresolved placeholders', () => {
    for (const locale of ['th', 'en'] as const) {
      for (const kind of KINDS) {
        const m = renderEmail(kind, locale, 'somchai@example.com', { name: 'Somchai', url: 'https://x.test/a?t=1', extra: '1 Jan', params: { inviter: 'A', org: 'B', role: 'C', sender: 'D' } });
        expect(m.subject.length).toBeGreaterThan(3);
        expect(m.text).not.toMatch(/\{\w+\}/);
        expect(m.html).toContain('lang="' + locale + '"');
      }
    }
  });
  it('escapes user-controlled values in the HTML body', () => {
    const m = renderEmail('verify', 'en', 'a@b.test', { name: '<script>alert(1)</script>', url: 'https://x.test/?a=1&b="2"' });
    expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('&lt;script&gt;');
    expect(m.html).toContain('&amp;b=&quot;2&quot;');
  });
  it('puts the action link in the plain-text part too', () => {
    expect(renderEmail('reset', 'th', 'a@b.test', { url: 'https://x.test/r?token=abc' }).text).toContain('https://x.test/r?token=abc');
  });
});
