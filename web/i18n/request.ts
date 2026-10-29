import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { logger } from '@/lib/logger';
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from './config';
import { intlMessageFallback, onIntlError } from './handlers';


// No locale segment in URLs (P1): the locale comes from the user's cookie, default Thai.
export default getRequestConfig(async () => {
  const store = await cookies();
  const cookieLocale = store.get(LOCALE_COOKIE)?.value;
  const locale: Locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    timeZone: 'Asia/Bangkok',
    // Missing or invalid message: logged server-side; loud in dev/test; an empty string (never the key path) in production.
    onError: (error) => onIntlError(error, (info) => logger.error(info, 'i18n_error')),
    getMessageFallback: intlMessageFallback,
  };
});
