import { Clock } from 'lucide-react';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { LogoMark } from '@/components/brand/Logo';
import { SharePassword } from '@/components/share/SharePassword';
import { SharedConversation } from '@/components/share/SharedConversation';
import { LanguageSwitch, ThemeSwitch } from '@/components/shell/PreferenceControls';
import { findShare, isUnlocked, shareCookieName, shareState, sharedMessages } from '@/lib/shares';

// A shared chat: read-only, no sign-in needed, never indexed, never shows who shared it (FR-CHAT-027).
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('share'))('title'), robots: { index: false, follow: false } };
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations('share');
  const appName = (await getTranslations('app'))('name');
  const locale = await getLocale();
  const share = await findShare(token);
  const jar = await cookies();
  const state = shareState(share, !!share && isUnlocked(share.id, jar.get(shareCookieName(share.id))?.value));

  const shell = (body: React.ReactNode) => (
    <div className="min-h-screen bg-bg text-text">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-serif text-lg font-bold"><LogoMark size={28} />{appName}</Link>
        <div className="flex-1" />
        <ThemeSwitch />
        <LanguageSwitch />
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-8">{body}</main>
    </div>
  );

  if (state === 'gone' || state === 'expired') {
    return shell(<section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6"><h1 className="font-serif text-2xl font-bold">{t(state === 'gone' ? 'goneTitle' : 'expiredTitle')}</h1><p className="text-muted">{t(state === 'gone' ? 'goneText' : 'expiredText')}</p></section>);
  }
  if (state === 'locked') {
    return shell(<section className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6"><h1 className="font-serif text-2xl font-bold">{t('lockedTitle')}</h1><p className="text-muted">{t('lockedText')}</p></section>);
  }
  if (state === 'password') return shell(<SharePassword token={token} />);

  const messages = await sharedMessages(share!);
  // The "based on the knowledge library" line is true only when a shared answer really cites it (answers from the company service have no citations).
  const hasCitations = messages.some((m) => m.role === 'assistant' && m.citations.length > 0);
  const firstQuestion = messages.find((m) => m.role === 'user')?.content.slice(0, 500) ?? '';
  const date = new Date(share!.created_at).toLocaleDateString(locale === 'th' ? 'th-TH-u-ca-buddhist' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' });
  return shell(
    <>
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-2xl font-bold">{share!.title || t('untitled')}</h1>
        <p className="flex items-center gap-1.5 text-sm text-muted"><Clock className="size-4" aria-hidden="true" />{t('sharedOn', { date })}</p>
      </div>
      <SharedConversation messages={messages} />
      <p className="rounded-lg bg-surface-2 px-4 py-3 text-sm text-muted">{t(hasCitations ? 'disclaimer' : 'disclaimerGeneral')}</p>
      <div>
        <Link href={`/chat?q=${encodeURIComponent(firstQuestion)}`} className="inline-flex h-11 items-center rounded-[10px] bg-primary px-5 font-semibold text-white hover:bg-primary-600">{t('askMore')}</Link>
        <p className="mt-2 text-xs text-muted">{t('askMoreHint')}</p>
      </div>
    </>,
  );
}
