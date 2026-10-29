'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { cardClass } from '@/components/account/styles';
import { apiFetch } from '@/lib/client/api';

type Share = { id: number; title: string | null; status: string; other_name: string; created_at: string; has_reply: boolean };

export function CounselInbox({ orgId, isCounsel, initialBox }: { orgId: string; isCounsel: boolean; initialBox: 'inbox' | 'sent' }) {
  const t = useTranslations('org.counsel');
  const locale = useLocale();
  const [box, setBox] = useState<'inbox' | 'sent'>(isCounsel ? initialBox : 'sent');
  const { data, isPending } = useQuery({ queryKey: ['counsel', orgId, box], queryFn: () => apiFetch<{ shares: Share[] }>(`/api/v1/orgs/${orgId}/counsel-shares?box=${box}`) });
  const when = (iso: string) => new Date(iso).toLocaleDateString(locale === 'th' ? 'th-TH-u-ca-buddhist' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' });
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
        <h1 className="font-serif text-2xl font-bold">{t('title')}</h1>
        <div role="tablist" className="flex gap-1 rounded-[10px] bg-surface-2 p-1">
          {(isCounsel ? (['inbox', 'sent'] as const) : (['sent'] as const)).map((b) => (
            <button key={b} type="button" role="tab" aria-selected={box === b} onClick={() => setBox(b)} className={`h-9 flex-1 rounded-lg text-sm ${box === b ? 'bg-surface font-semibold shadow-sm' : 'text-muted'}`}>{t(b)}</button>
          ))}
        </div>
        <section className={cardClass}>
          {isPending ? <p className="text-muted">…</p> : data?.shares.length === 0 ? <p className="text-muted">{t(box === 'inbox' ? 'emptyInbox' : 'emptySent')}</p> : (
            <ul className="flex flex-col divide-y divide-border">
              {data?.shares.map((s) => (
                <li key={s.id}>
                  <Link href={`/org/counsel/${s.id}`} className="flex flex-wrap items-center gap-3 py-3 hover:bg-surface-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{s.title || t('untitled')}</span>
                      <span className="block text-sm text-muted">{t(box === 'inbox' ? 'from' : 'to', { name: s.other_name })} · {when(s.created_at)}</span>
                    </span>
                    <span className={`rounded-full px-3 py-1 text-xs ${s.status === 'open' ? 'bg-warning-050 text-warning' : 'bg-success-050 text-success'}`}>{t(`status.${s.status}` as never)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
