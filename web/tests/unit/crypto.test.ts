import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { decryptWith, encryptWith, parseKeyring } = await import('@/lib/crypto');
const vectors = JSON.parse(readFileSync(new URL('../../../db/seeds/crypto_vectors.json', import.meta.url), 'utf8')).vectors as {
  key_base64: string; key_version: number; nonce_hex: string; aad: string; plaintext: string; ciphertext_hex: string;
}[];

describe('field encryption', () => {
  it('matches the shared test vectors (the Python side must produce the same bytes)', () => {
    for (const v of vectors) {
      const kr = parseKeyring(v.key_base64, undefined, v.key_version);
      expect(encryptWith(kr, v.plaintext, v.aad, Buffer.from(v.nonce_hex, 'hex')).toString('hex')).toBe(v.ciphertext_hex);
      expect(decryptWith(kr, Buffer.from(v.ciphertext_hex, 'hex'), v.aad).toString('utf8')).toBe(v.plaintext);
    }
  });
  const kr = parseKeyring(Buffer.alloc(32, 1).toString('base64'), undefined, 2);
  it('round-trips and uses a fresh nonce each time', () => {
    const a = encryptWith(kr, 'ข้อความลับ', 'app.t.c:1');
    const b = encryptWith(kr, 'ข้อความลับ', 'app.t.c:1');
    expect(a.equals(b)).toBe(false);
    expect(decryptWith(kr, a, 'app.t.c:1').toString('utf8')).toBe('ข้อความลับ');
  });
  it('rejects a value moved to another row/column, and tampered data', () => {
    const blob = encryptWith(kr, 'secret', 'app.t.c:1');
    expect(() => decryptWith(kr, blob, 'app.t.c:2')).toThrow();
    const bad = Buffer.from(blob);
    bad[20] ^= 1;
    expect(() => decryptWith(kr, bad, 'app.t.c:1')).toThrow();
  });
  it('decrypts with a previous key after rotation', () => {
    const old = parseKeyring(Buffer.alloc(32, 1).toString('base64'), undefined, 1);
    const blob = encryptWith(old, 'legacy', 'a:1');
    const rotated = parseKeyring(Buffer.alloc(32, 9).toString('base64'), `1:${Buffer.alloc(32, 1).toString('base64')}`, 2);
    expect(decryptWith(rotated, blob, 'a:1').toString('utf8')).toBe('legacy');
  });
  it('refuses keys that are not 32 bytes', () => {
    expect(() => parseKeyring('c2hvcnQ=', undefined)).toThrow();
  });
});
