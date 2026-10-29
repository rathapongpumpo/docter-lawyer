'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { inputClass } from '@/components/account/styles';
import { apiFetch } from '@/lib/client/api';
import { StatusPill as StatusBadge } from './StatusPill';
import { AdminPage, selectClass, tableWrap, td, th } from './ui';

type Item = { type: string; id: number; slug: string; title: string; status: 'draft' | 'in_review' | 'published' | 'archived'; version_no: number; edited_in_app: boolean; updated_at: string; has_draft: boolean };

// FR-ADM-002: every article, guide, template and glossary term. Drafts open in the editor; published content is changed through a new revision.
export function ContentList() {
  const t = useTranslations('admin.content');
  const tt = useTranslations('admin');
  const locale = useLocale();
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const { data, isPending } = useQuery({ queryKey: ['admin-content'], queryFn: () => apiFetch<{ items: Item[] }>('/api/v1/admin/content-items') });
  const items = (data?.items ?? []).filter((i) => (!type || i.type === type) && (!q || i.title.toLowerCase().includes(q.toLowerCase()) || i.slug.includes(q.toLowerCase())));
  const day = (iso: string) => new Date(iso).toLocaleDateString(locale === 'th' ? 'th-TH-u-ca-buddhist' : 'en-GB', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'Asia/Bangkok' });
  return (
    <AdminPage title={t('title')} intro={t('intro')}>
      <div className="flex flex-wrap gap-2">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} aria-label={t('search')} className={`${inputClass} max-w-xs`} />
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label={t('type')} className={selectClass}><option value="">{t('allTypes')}</option>{['article', 'guide', 'template', 'glossary'].map((x) => <option key={x} value={x}>{tt('type', { type: x })}</option>)}</select>
      </div>
      <div className={tableWrap} tabIndex={0}>
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-surface-2"><tr><th className={th}>{t('type')}</th><th className={th}>{t('titleCol')}</th><th className={th}>{t('version')}</th><th className={th}>{t('status')}</th><th className={th}>{t('updated')}</th></tr></thead>
          <tbody className="divide-y divide-border">
            {isPending && <tr><td className={td} colSpan={5}>…</td></tr>}
            {items.map((i) => (
              <tr key={`${i.type}:${i.id}`} className="hover:bg-surface-2">
                <td className={`${td} text-muted`}>{tt('type', { type: i.type })}</td>
                <td className={td}><Link href={`/admin/content/${i.type}/${i.id}`} className="font-medium text-primary-700 hover:underline">{i.title}</Link><span className="block font-mono text-xs text-muted">{i.slug}</span></td>
                <td className={td}>v{i.version_no}{i.edited_in_app && <span className="ml-1 text-xs text-muted">{t('edited')}</span>}</td>
                <td className={td}><StatusBadge status={i.status} />{i.has_draft && i.status !== 'draft' && <span className="ml-1 text-xs text-warning">{t('hasDraft')}</span>}</td>
                <td className={`${td} whitespace-nowrap text-muted`}>{day(i.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isPending && items.length === 0 && <p className="p-4 text-muted">{t('empty')}</p>}
      </div>
    </AdminPage>
  );
}
