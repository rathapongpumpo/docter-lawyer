'use client';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { secondaryBtn } from '@/components/account/styles';
import { apiFetch } from '@/lib/client/api';
import { AdminPage, tableWrap, td, th } from './ui';

type Data = {
  daily: { day: string; messages: number; users: number; org_messages: number }[];
  totals: { members: number; guests: number; orgs: number; chats: number; contracts: number };
};

// FR-ADM-016: usage per day.
export function AdminUsage() {
  const t = useTranslations('admin.usage');
  const { data } = useQuery({ queryKey: ['admin-usage'], queryFn: () => apiFetch<Data>('/api/v1/admin/usage?days=30') });
  const totals = data?.totals;
  return (
    <AdminPage title={t('title')} intro={t('intro')} actions={<a href="/api/v1/admin/usage?days=30&format=csv" download className={secondaryBtn}><Download className="size-4" aria-hidden="true" />{t('export')}</a>}>
      {totals && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {([['members', totals.members], ['guests', totals.guests], ['orgs', totals.orgs], ['chats', totals.chats], ['contracts', totals.contracts]] as const).map(([k, v]) => (
            <div key={k} className="rounded-xl border border-border bg-surface p-3"><dt className="text-sm text-muted">{t(`totals.${k}`)}</dt><dd className="text-2xl font-bold">{v}</dd></div>
          ))}
        </dl>
      )}
      <h2 className="text-lg font-bold">{t('perDay')}</h2>
      <div className={tableWrap} tabIndex={0}>
        <table className="w-full min-w-[420px] text-sm"><thead className="bg-surface-2"><tr><th className={th}>{t('day')}</th><th className={th}>{t('messages')}</th><th className={th}>{t('users')}</th><th className={th}>{t('orgMessages')}</th></tr></thead>
          <tbody className="divide-y divide-border">{data?.daily.map((d) => <tr key={d.day}><td className={td}>{d.day}</td><td className={td}>{d.messages}</td><td className={td}>{d.users}</td><td className={td}>{d.org_messages}</td></tr>)}</tbody></table>
        {data && data.daily.length === 0 && <p className="p-4 text-muted">{t('empty')}</p>}
      </div>
    </AdminPage>
  );
}
