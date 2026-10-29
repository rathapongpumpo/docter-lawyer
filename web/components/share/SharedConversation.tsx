'use client';
import { useTranslations } from 'next-intl';
import { LogoMark } from '@/components/brand/Logo';
import { Markdown } from '@/components/chat/Markdown';

type Msg = { id: number; role: 'user' | 'assistant'; content: string; citations: { n: number; label: string; title: string; url: string; as_of: string }[] };

// Read-only rendering of a shared chat. Citations are listed (with their as-of date) but the source drawer is not offered.
export function SharedConversation({ messages }: { messages: Msg[] }) {
  const t = useTranslations('share');
  return (
    <div className="flex flex-col gap-5">
      {messages.map((m) =>
        m.role === 'user' ? (
          <div key={m.id} className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-primary-050 px-4 py-3 whitespace-pre-wrap">{m.content}</div>
        ) : (
          <div key={m.id} className="flex flex-col gap-2">
            <div className="flex items-center gap-2"><LogoMark size={26} /><span className="text-sm font-semibold">{t('assistant')}</span></div>
            <div className="rounded-2xl rounded-tl-sm border border-border bg-surface px-4 py-3"><Markdown text={m.content} /></div>
            {m.citations.length > 0 && (
              <ul className="flex flex-col gap-1 text-sm">
                <li className="font-semibold text-muted">{t('sources')}</li>
                {m.citations.map((c) => (
                  <li key={c.n}><span className="font-bold text-primary-700">[{c.n}]</span> {c.label} <span className="text-muted">— {c.title} · {t('asOf', { date: c.as_of })}</span></li>
                ))}
              </ul>
            )}
          </div>
        ),
      )}
    </div>
  );
}
