import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Markdown } from '@/components/chat/Markdown';
import { PrintButton } from '@/components/chat/PrintButton';
import { auth } from '@/lib/auth';
import { getChatWithMessages } from '@/lib/chats';

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Print view of a chat (FR-CHAT-028): a clean page the browser saves as PDF — the title, date, conversation, sources and the disclaimer.
export default async function PrintChatPage({ params, searchParams }: { params: Promise<{ chatId: string }>; searchParams: Promise<{ auto?: string }> }) {
  const { chatId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(`/login?next=${encodeURIComponent(`/print/${chatId}`)}`);
  const data = await getChatWithMessages(session, chatId).catch(() => null);
  if (!data) notFound();
  const t = await getTranslations('print');
  const locale = await getLocale();
  const date = new Date().toLocaleDateString(locale === 'th' ? 'th-TH-u-ca-buddhist' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' });
  const auto = (await searchParams).auto === '1';
  return (
    <main className="mx-auto max-w-3xl bg-white p-8 text-black print:p-0">
      <header className="mb-6 flex flex-col gap-1 border-b border-gray-300 pb-4">
        <p className="text-sm font-bold">{(await getTranslations('app'))('name')}</p>
        <h1 className="font-serif text-2xl font-bold">{data.chat.title || t('untitled')}</h1>
        <p className="text-sm text-gray-600">{t('printedOn', { date })}</p>
        <div className="print:hidden"><PrintButton auto={auto} label={t('print')} /></div>
      </header>
      <div className="flex flex-col gap-5">
        {data.messages.filter((m) => m.role !== 'system_notice' && m.status === 'completed').map((m) => (
          <section key={m.id} className="break-inside-avoid">
            <p className="mb-1 text-xs font-bold text-gray-600">{m.role === 'user' ? t('you') : t('assistant')}</p>
            {m.role === 'user' ? <p className="leading-relaxed whitespace-pre-wrap">{m.content}</p> : <Markdown text={m.content} />}
            {m.role === 'assistant' && m.citations.length > 0 && (
              <ul className="mt-2 text-sm text-gray-700">
                {m.citations.map((c) => <li key={c.n}>[{c.n}] {c.label} — {c.title} ({t('asOf', { date: c.as_of })})</li>)}
              </ul>
            )}
          </section>
        ))}
      </div>
      <footer className="mt-8 border-t border-gray-300 pt-3 text-xs text-gray-600">{(await getTranslations('app'))('disclaimer')}</footer>
    </main>
  );
}
