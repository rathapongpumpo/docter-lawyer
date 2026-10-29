import { describe, expect, it } from 'vitest';
import { maskPii } from '@/lib/pii';

describe('maskPii', () => {
  it('masks ID numbers, phones, bank accounts and e-mail addresses', () => {
    expect(maskPii('บัตร 1-1234-56789-01-2 โทร 081-234-5678')).toBe('บัตร [เลขบัตรประชาชน] โทร [เบอร์โทร]');
    expect(maskPii('บัญชี 123-4-56789-0 อีเมล a.b@example.co.th')).toBe('บัญชี [เลขบัญชี] อีเมล [อีเมล]');
    expect(maskPii('โทร 02-123-4567')).toBe('โทร [เบอร์โทร]');
  });
  it('leaves amounts, dates and section numbers alone', () => {
    const t = 'ปรับวันละ 20,000 บาท ตามมาตรา 383 ภายใน 30 วัน ตั้งแต่ 1/1/2569';
    expect(maskPii(t)).toBe(t);
  });
});
