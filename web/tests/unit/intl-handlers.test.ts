import { IntlError, IntlErrorCode } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

// A missing message must never reach a user as a raw key path: loud in dev/test, an empty string in production.
describe('intl error handlers', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  it('throws outside production so a missing key fails loudly', async () => {
    const { onIntlError } = await import('../../i18n/handlers');
    expect(() => onIntlError(new IntlError(IntlErrorCode.MISSING_MESSAGE, 'x'))).toThrow();
  });

  it('logs and keeps going in production, and the fallback is an empty string', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const { onIntlError, intlMessageFallback } = await import('../../i18n/handlers');
    const log = vi.fn();
    expect(() => onIntlError(new IntlError(IntlErrorCode.MISSING_MESSAGE, 'x'), log)).not.toThrow();
    expect(log).toHaveBeenCalledOnce();
    expect(intlMessageFallback()).toBe('');
  });
});
