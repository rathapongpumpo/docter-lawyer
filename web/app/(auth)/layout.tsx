import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { LanguageSwitch, ThemeSwitch } from '@/components/shell/PreferenceControls';

// Sign-in screens: the law-library photo as backdrop, one gold card with the logo tile on top (Nitimitr theme).
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations();
  return (
    <div className="auth-bg relative flex min-h-screen flex-col items-center justify-center gap-4 px-4 py-20">
      <div className="absolute top-4 right-4 flex gap-2">
        <ThemeSwitch />
        <LanguageSwitch />
      </div>
      <main className="on-gold flex w-full max-w-[480px] flex-col gap-5 rounded-[28px] p-8 shadow-[0_24px_60px_-20px_rgba(10,26,48,0.55)]">
        <h1 className="sr-only">{t('app.name')}</h1>
        <div className="mx-auto flex size-40 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm">
          <Image src="/theme/logo-login.png" alt={t('app.name')} width={160} height={160} unoptimized priority />
        </div>
        <hr className="border-border-strong" />
        {children}
      </main>
      <p className="max-w-[480px] rounded-full bg-white/80 px-4 py-1.5 text-center text-xs text-navy backdrop-blur-sm dark:bg-black/50 dark:text-white/80">{t('app.disclaimer')}</p>
    </div>
  );
}
