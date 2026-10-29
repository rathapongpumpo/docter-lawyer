import type { IntlError } from 'next-intl';

// A message problem must never show a raw key path to a user (e.g. "settings.privacy.withdrawNote").
//  - production: log it and render an empty string;
//  - development / test: throw, so a missing key fails loudly before it ships.
// Only the key path is logged, never message text or user input.
const isProd = process.env.NODE_ENV === 'production';

export function onIntlError(error: IntlError, log: (info: { code: string; detail: string }) => void = defaultLog): void {
  if (!isProd) throw error;
  log({ code: error.code, detail: error.originalMessage ?? error.message });
}

export function intlMessageFallback(): string {
  return '';
}

function defaultLog(info: { code: string; detail: string }): void {
  console.error('i18n_error', info);
}
