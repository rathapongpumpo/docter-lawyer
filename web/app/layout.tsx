import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { cookies, headers } from 'next/headers';
import { getLocale, getMessages, getTimeZone, getTranslations } from 'next-intl/server';
import { IntlProvider } from '@/components/shell/IntlProvider';
import { Providers } from './providers';
import './globals.css';

// IBM Plex Sans Thai (UI, content, headings; Thai + Latin) and IBM Plex Mono (code, ids) — self-hosted WOFF2 from Google Fonts
// (SIL OFL 1.1, see app/fonts/README.md), so no request leaves the server at build or run time.
const plexSansThai = localFont({
  src: [
    { path: './fonts/IBMPlexSansThai-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/IBMPlexSansThai-Medium.woff2', weight: '500', style: 'normal' },
    { path: './fonts/IBMPlexSansThai-SemiBold.woff2', weight: '600', style: 'normal' },
    { path: './fonts/IBMPlexSansThai-Bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-plex-thai',
  display: 'swap',
});
const plexMono = localFont({
  src: [
    { path: './fonts/IBMPlexMono-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/IBMPlexMono-Medium.woff2', weight: '500', style: 'normal' },
    { path: './fonts/IBMPlexMono-SemiBold.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-plex-mono',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return { title: { default: t('name'), template: `%s — ${t('name')}` }, description: t('tagline') };
}

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const [locale, messages, timeZone] = await Promise.all([getLocale(), getMessages(), getTimeZone()]);
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  // Text size for older users (settings → preferences); the cookie is written by the settings screen.
  const scale = Number((await cookies()).get('lc_scale')?.value);
  const fontSize = [112, 125, 150].includes(scale) ? `${scale}%` : undefined;
  return (
    <html lang={locale} className={`${plexSansThai.variable} ${plexMono.variable}`} style={fontSize ? { fontSize } : undefined} suppressHydrationWarning>
      <body className="antialiased">
        <IntlProvider locale={locale} messages={messages} timeZone={timeZone}>
          <Providers nonce={nonce}>{children}</Providers>
        </IntlProvider>
      </body>
    </html>
  );
}
