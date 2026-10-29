'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { errorClass, noticeClass, primaryBtn } from '@/components/account/styles';
import { apiFetch } from '@/lib/client/api';
import { AdminPage, selectClass } from './ui';

type Detail = {
  id: number; reasons: string[]; comment: string | null; allow_review: boolean; org_chat: boolean; review_state: string; root_cause: string | null; reviewer_note: string | null;
  corrected_answer: string | null; created_at: string; verification_status: string | null; scope: string[];
  conversation: { question: string | null; answer: string; citations: { n: number; label: string; title: string }[] } | null;
};
const CAUSES = ['retrieval', 'content_gap', 'outdated', 'guardrail', 'other'];

export function AdminFeedbackDetail({ id }: { id: string }) {
  const t = useTranslations('admin.feedback');
  const tr = useTranslations('chat.feedback.reason');
  const qc = useQueryClient();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { data: d, isError } = useQuery({ queryKey: ['admin-feedback-item', id], retry: false, queryFn: () => apiFetch<Detail>(`/api/v1/admin/feedback/${id}`) });
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await apiFetch(`/api/v1/admin/feedback/${id}`, { method: 'PATCH', body: JSON.stringify({
        review_state: String(f.get('state')), root_cause: String(f.get('cause')) || null, reviewer_note: String(f.get('note')).trim() || null, corrected_answer: String(f.get('corrected')).trim() || null }) });
      setMsg({ ok: true, text: t('saved') });
      await qc.invalidateQueries({ queryKey: ['admin-feedback-item', id] });
      await qc.invalidateQueries({ queryKey: ['admin-feedback'] });
    } catch {
      setMsg({ ok: false, text: t('error') });
    }
  }
  if (isError) return <AdminPage title={t('title')}><p className="text-muted">{t('notFound')}</p></AdminPage>;
  if (!d) return <AdminPage title={t('title')}><p className="text-muted">…</p></AdminPage>;
  return (
    <AdminPage title={`${t('detail')} #${d.id}`} actions={<Link href="/admin/feedback" className="text-sm text-primary-700 hover:underline">← {t('title')}</Link>}>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
          <h2 className="text-lg font-bold">{t('metadata')}</h2>
          <p className="text-sm">{t('reasons')}: {d.reasons.map((r) => tr(r as never)).join(', ') || '—'}</p>
          <p className="text-sm">{t('comment')}: {d.comment ?? '—'}</p>
          <p className="text-sm text-muted">{t('scope')}: {d.scope.join(', ') || t('auto')}</p>
          <h2 className="mt-2 text-lg font-bold">{t('conversation')}</h2>
          {d.conversation ? (
            <>
              <p className="text-xs text-muted">{t('maskedNote')}</p>
              <p className="rounded-lg bg-primary-050 px-3 py-2 text-sm whitespace-pre-wrap"><b>{t('question')}:</b> {d.conversation.question ?? '—'}</p>
              <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm whitespace-pre-wrap"><b>{t('answer')}:</b> {d.conversation.answer}</p>
              {d.conversation.citations.length > 0 && <ul className="text-xs text-muted">{d.conversation.citations.map((c) => <li key={c.n}>[{c.n}] {c.label} — {c.title}</li>)}</ul>}
            </>
          ) : (
            <p className="rounded-lg bg-warning-050 px-3 py-2 text-sm text-warning">{d.org_chat ? t('orgChatHidden') : t('notAllowedHidden')}</p>
          )}
        </section>
        <form onSubmit={(e) => void save(e)} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
          <h2 className="text-lg font-bold">{t('triage')}</h2>
          <label className="flex flex-col gap-1 text-sm font-medium">{t('state')}<select name="state" defaultValue={d.review_state} className={selectClass}>{['open', 'triaged', 'resolved', 'wont_fix'].map((s) => <option key={s} value={s}>{t(`states.${s}` as never)}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-sm font-medium">{t('cause')}<select name="cause" defaultValue={d.root_cause ?? ''} className={selectClass}><option value="">—</option>{CAUSES.map((c) => <option key={c} value={c}>{t(`causes.${c}` as never)}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-sm font-medium">{t('note')}<textarea name="note" rows={3} maxLength={1000} defaultValue={d.reviewer_note ?? ''} className="rounded-lg border border-border-strong bg-surface p-2 font-normal" /></label>
          <label className="flex flex-col gap-1 text-sm font-medium">{t('corrected')}<textarea name="corrected" rows={4} maxLength={4000} defaultValue={d.corrected_answer ?? ''} className="rounded-lg border border-border-strong bg-surface p-2 font-normal" /></label>
          {msg && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? noticeClass : errorClass}>{msg.text}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={primaryBtn}>{t('save')}</button>
          </div>
        </form>
      </div>
    </AdminPage>
  );
}
