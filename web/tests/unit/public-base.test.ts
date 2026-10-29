import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { publicBase } = await import('@/lib/api/origin');

const req = (headers: Record<string, string>, url = 'http://localhost:3200/api/v1/x') => new Request(url, { headers });

describe('publicBase (links other people will open)', () => {
  it('uses the address the caller used, not the configured APP_URL', () => {
    process.env.APP_URL = 'http://localhost:3200';
    expect(publicBase(req({ origin: 'https://nitimitr.promptnow.com' }))).toBe('https://nitimitr.promptnow.com');
    expect(publicBase(req({ origin: 'http://192.168.31.21:3200' }))).toBe('http://192.168.31.21:3200');
  });

  it('falls back to the forwarded host when there is no Origin header', () => {
    expect(publicBase(req({ 'x-forwarded-host': 'nitimitr.promptnow.com', 'x-forwarded-proto': 'https' }))).toBe('https://nitimitr.promptnow.com');
    expect(publicBase(req({ host: '100.64.16.111:3200' }))).toBe('http://100.64.16.111:3200');
  });

  it('ignores a "null" or malformed Origin', () => {
    expect(publicBase(req({ origin: 'null', host: 'a.example' }))).toBe('http://a.example');
    expect(publicBase(req({ origin: 'not a url', host: 'b.example' }))).toBe('http://b.example');
  });
});
