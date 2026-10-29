'use client';
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl';
import type { ReactNode } from 'react';
import { intlMessageFallback, onIntlError } from '@/i18n/handlers';

// Client-side twin of the server config in i18n/request.ts: functions cannot cross the server/client boundary,
// so the error handlers are attached here (missing key: loud in dev/test, empty string in production).
export function IntlProvider({ locale, messages, timeZone, children }: { locale: string; messages: AbstractIntlMessages; timeZone: string; children: ReactNode }) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone} onError={onIntlError} getMessageFallback={intlMessageFallback}>
      {children}
    </NextIntlClientProvider>
  );
}
