'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { errorClass, noticeClass, primaryBtn, secondaryBtn } from '@/components/account/styles';
import { ChatView } from '@/components/chat/ChatView';
import { apiFetch } from '@/lib/client/api';

type Share = { id: number; resource_id: string; status: string; from: string; to: string; i_am_recipient: boolean; note: string | null; reply: string | null };

export function CounselDetail({ shareId }: { shareId: string }) {
  const t = useTranslations('org.counsel');
  const qc = useQueryClient();
  const { data: s } = useQuery({ queryKey: ['counsel-share', shareId], queryFn: () => apiFetch<Share>(`/api/v1/counsel-shares/${shareId}`) });
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [sent, setSent] = useState(false);
  if (!s) return <p className="p-6 text-muted">…</p>;

  async function send(status: 'answered' | 'closed', reply?: string) {
    setError(null);
    try {
      await apiFetch(`/api/v1/counsel-shares/${shareId}`, { method: 'PATCH', body: JSON.stringify({ status, reply }) });
      await qc.invalidateQueries({ queryKey: ['counsel-share', shareId] });
      await qc.invalidateQueries({ queryKey: ['counsel'] });
      if (status === 'answered') { setEditing(false); setSent(true); }
    } catch {
      setError(t('error'));
    }
  }
  function onReply(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void send('answered', String(new FormData(e.currentTarget).get('reply')));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border bg-surface">
       <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-4">
        <Link href={s.i_am_recipient ? '/org/counsel' : '/org/counsel?box=sent'} className="text-sm text-primary-700 hover:underline">{t('back')}</Link>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold">{s.i_am_recipient ? t('from', { name: s.from }) : t('to', { name: s.to })}</p>
          <span className={`rounded-full px-3 py-1 text-xs ${s.status === 'open' ? 'bg-warning-050 text-warning' : s.status === 'answered' ? 'bg-success-050 text-success' : 'bg-surface-2 text-muted'}`}>{t(`status.${s.status}` as never)}</span>
        </div>
        {s.note && <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm whitespace-pre-wrap"><b>{t('note')}: </b>{s.note}</p>}
        {s.reply && (
          <div className="rounded-lg bg-success-050 px-3 py-2 text-sm whitespace-pre-wrap text-text">
            <b>{t('reply')}: </b>{s.reply}
            <p className="mt-1 text-xs text-muted">{t('replyDisclaimer')}</p>
          </div>
        )}
        {sent && <p role="status" className={noticeClass}>{t('replySent')}</p>}
        {s.i_am_recipient && s.status !== 'closed' && s.reply && !editing && (
          <div><button type="button" className={secondaryBtn} onClick={() => { setEditing(true); setSent(false); }}>{t('editReply')}</button></div>
        )}
        {s.i_am_recipient && s.status !== 'closed' && (!s.reply || editing) && (
          <form onSubmit={onReply} className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-sm font-medium">{t('yourReply')}
              <textarea name="reply" required rows={3} maxLength={4000} defaultValue={s.reply ?? ''} className="rounded-lg border border-border-strong bg-surface p-2 text-sm font-normal" />
            </label>
            {error && <p role="alert" className={errorClass}>{error}</p>}
            <div className="flex gap-2">
              <button type="submit" className={primaryBtn}>{t('sendReply')}</button>
              <button type="button" className={secondaryBtn} onClick={() => void send('closed')}>{t('close')}</button>
            </div>
          </form>
        )}
        {s.status === 'closed' && <p role="status" className={noticeClass}>{t('closed')}</p>}
       </div>
      </div>
      <ChatView chatId={s.resource_id} />
    </div>
  );
}
