'use client';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { cardClass, inputClass } from '@/components/account/styles';
import { apiFetch } from '@/lib/client/api';

type Usage = {
  month: string;
  members: { user_id: number; name: string; messages: number; today: number }[];
  total_messages: number;
  limits: { chat_daily_per_member: number; seat_limit: number };
  seats: { members: number; pending: number };
};

export function UsageView({ orgId }: { orgId: string }) {
  const t = useTranslations('org.usage');
  const [month, setMonth] = useState('');
  const { data } = useQuery({ queryKey: ['org-usage', orgId, month], queryFn: () => apiFetch<Usage>(`/api/v1/orgs/${orgId}/usage${month ? `?month=${month}` : ''}`) });
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="font-serif text-2xl font-bold">{t('title')}</h1>
          <label className="flex flex-col gap-1 text-sm font-medium">{t('month')}
            <input type="month" value={month || data?.month || ''} onChange={(e) => setMonth(e.target.value)} className={`${inputClass} w-44`} />
          </label>
        </div>
        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                [t('totalMessages'), data.total_messages],
                [t('seats'), `${data.seats.members}/${data.limits.seat_limit}`],
                [t('dailyLimit'), data.limits.chat_daily_per_member],
              ].map(([label, value]) => (
                <div key={String(label)} className={cardClass}><span className="text-sm text-muted">{label}</span><span className="text-2xl font-bold">{value}</span></div>
              ))}
            </div>
            <section className={cardClass}>
              <h2 className="text-lg font-bold">{t('perMember')}</h2>
              {data.members.length === 0 ? <p className="text-muted">{t('empty')}</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-muted"><th className="py-1 font-medium">{t('member')}</th><th className="py-1 text-right font-medium">{t('today')}</th><th className="py-1 text-right font-medium">{t('thisMonth')}</th></tr></thead>
                  <tbody>{data.members.map((m) => (
                    <tr key={m.user_id} className="border-t border-border"><td className="py-2">{m.name}</td><td className="py-2 text-right">{m.today}</td><td className="py-2 text-right font-semibold">{m.messages}</td></tr>
                  ))}</tbody>
                </table>
              )}
              <p className="text-xs text-muted">{t('privacyNote')}</p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
