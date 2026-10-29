'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Trash2, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { cardClass, secondaryBtn } from '@/components/account/styles';
import { ConfirmDialog } from '@/components/shell/ConfirmDialog';
import { apiFetch } from '@/lib/client/api';
import type { ReviewMode } from '@/lib/contract-review-shared';
import { ContractReview } from './ContractReview';
import { StatusBadge, type ContractItem } from './ContractsView';

type Detail = ContractItem & { clauses: { ref: string; title: string; page: number | null; text: string }[] };

// One contract: how it was read, its clauses as segmented (FR-CR-002) and — when a review backend is switched on — its review (M12).
export function ContractDetail({ id, adminCanDelete, reviewMode }: { id: string; adminCanDelete: boolean; reviewMode: ReviewMode }) {
  const t = useTranslations('contracts');
  const locale = useLocale();
  const router = useRouter();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const { data: c, isError } = useQuery({
    queryKey: ['contract', id], retry: false,
    queryFn: () => apiFetch<Detail>(`/api/v1/contracts/${id}`),
    refetchInterval: (q) => (q.state.data && (q.state.data.status === 'uploaded' || q.state.data.status === 'extracting' || q.state.data.status === 'reviewing') ? 2000 : false),
  });
  if (isError) return <p className="p-6 text-muted">{t('notFound')} <Link href="/contracts" className="text-primary-700 underline">{t('back')}</Link></p>;
  if (!c) return <p className="p-6 text-muted">…</p>;
  const date = new Date(c.created_at).toLocaleDateString(locale === 'th' ? 'th-TH-u-ca-buddhist' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' });
  async function setVis(v: 'private' | 'org') { await apiFetch(`/api/v1/contracts/${id}`, { method: 'PATCH', body: JSON.stringify({ visibility: v }) }); await qc.invalidateQueries({ queryKey: ['contract', id] }); }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4 sm:p-6">
        <Link href="/contracts" className="text-sm text-primary-700 hover:underline">← {t('back')}</Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="min-w-0 flex-1 truncate font-serif text-2xl font-bold" title={c.file_name}>{c.file_name}</h1>
          <StatusBadge status={c.status} />
          {(c.mine || adminCanDelete) && <button type="button" onClick={() => setConfirm(true)} className={`${secondaryBtn} text-danger`}><Trash2 className="size-4" aria-hidden="true" />{t('deleteShort')}</button>}
        </div>
        <p className="text-sm text-muted">
          {c.type.toUpperCase()}{c.page_count ? ` · ${t('pages', { n: c.page_count })}` : ''} · {t('uploadedOn', { date })}{c.uploader ? ` · ${c.uploader}` : ''}
        </p>
        {c.mine && (
          <div role="radiogroup" aria-label={t('visibility')} className="flex w-fit gap-0.5 rounded-lg bg-surface-2 p-0.5">
            {(['private', 'org'] as const).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={c.visibility === v} onClick={() => void setVis(v)} className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-sm ${c.visibility === v ? 'bg-surface font-semibold shadow-sm' : 'text-muted'}`}>
                {v === 'private' ? <Lock className="size-3.5" aria-hidden="true" /> : <Users className="size-3.5" aria-hidden="true" />}{v === 'private' ? t('visPrivate') : t('visOrg')}
              </button>
            ))}
          </div>
        )}
        {c.counterparty_hint && <p className="text-sm"><b>{t('parties')}:</b> {c.counterparty_hint} <span className="text-muted">({t('partiesHint')})</span></p>}
        <p className="rounded-lg bg-warning-050 px-4 py-3 text-sm text-warning">{t('phaseNotice')}</p>
        {(c.status === 'uploaded' || c.status === 'extracting') && <p role="status" className="text-muted">{t('reading')}</p>}
        {c.status === 'unsupported_scan' && <p role="alert" className="rounded-lg bg-danger-050 px-4 py-3 text-danger">{t('scanNotice')}</p>}
        {c.status === 'failed' && <p role="alert" className="rounded-lg bg-danger-050 px-4 py-3 text-danger">{t('failedNotice')}</p>}
        {reviewMode !== 'off' && (c.status === 'ready' || c.status === 'reviewing' || c.status === 'reviewed') && (
          <ContractReview id={id} mode={reviewMode} clauses={c.clauses} canStart />
        )}
        {(c.status === 'ready' || c.status === 'reviewing' || c.status === 'reviewed') && (
          <section className="flex flex-col gap-3" aria-label={t('clauses')}>
            <h2 className="text-lg font-bold">{t('clauses')} <span className="text-sm font-normal text-muted">({c.clauses.length})</span></h2>
            <p className="text-xs text-muted">{t('clausesHint')}</p>
            {c.clauses.map((cl, i) => (
              <article key={`${cl.ref}-${i}`} className={cardClass}>
                <header className="flex flex-wrap items-baseline gap-2">
                  <h3 className="font-bold">{cl.ref}{cl.title ? ` — ${cl.title}` : ''}</h3>
                  {cl.page ? <span className="text-xs text-muted">{t('page', { n: cl.page })}</span> : null}
                </header>
                <p className="leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{cl.text}</p>
              </article>
            ))}
          </section>
        )}
      </div>
      {confirm && (
        <ConfirmDialog title={t('deleteTitle')} confirmLabel={t('deleteConfirm')} onCancel={() => setConfirm(false)} onConfirm={async () => { await apiFetch(`/api/v1/contracts/${id}`, { method: 'DELETE' }); router.replace('/contracts'); }}>
          {t('deleteText', { name: c.file_name })}
        </ConfirmDialog>
      )}
    </div>
  );
}
