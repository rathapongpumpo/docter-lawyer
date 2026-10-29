'use client';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { apiFetch } from '@/lib/client/api';

type Props = {
  type: string;
  id: number;
  status: 'draft' | 'in_review' | 'published' | 'archived';
  role: 'editor' | 'reviewer' | 'admin';
  checklist: string[];
  isSubmitter: boolean;
  needsEffectiveDate: boolean;
  effectiveFrom: string | null;
};

const field = 'w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm';
const btn = 'inline-flex h-10 items-center justify-center rounded-[10px] px-4 text-sm font-semibold disabled:opacity-50';

// Review decisions for one item (docs/03-technical-spec.md §6.4). The server re-checks every rule.
export function ReviewActions(p: Props) {
  const t = useTranslations('admin');
  const router = useRouter();
  const [note, setNote] = useState('');
  const [ticked, setTicked] = useState<string[]>([]);
  const [date, setDate] = useState(p.effectiveFrom ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const isReviewer = p.role === 'reviewer' || p.role === 'admin';

  async function call(path: string, body: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch(`/api/v1/admin/content/${p.id}/${path}`, { method: 'POST', body: JSON.stringify({ type: p.type, ...body }) });
      setMessage({ ok: true, text: t('done') });
      setNote('');
      setTicked([]);
      router.refresh();
    } catch (e) {
      setMessage({ ok: false, text: t('errorGeneric', { error: (e as Error).message }) });
    } finally {
      setBusy(false);
    }
  }

  function decide(decision: 'approve' | 'request_changes' | 'reject') {
    if (decision !== 'approve' && !note.trim()) {
      setMessage({ ok: false, text: t('commentRequired') });
      return;
    }
    void call('decision', {
      decision,
      comment: note.trim() || undefined,
      checklist: ticked,
      effective_from: p.needsEffectiveDate && date ? date : undefined,
    });
  }

  const allTicked = p.checklist.every((k) => ticked.includes(k));
  const canApprove = allTicked && !p.isSubmitter && (!p.needsEffectiveDate || !!date);

  let body: React.ReactNode = null;
  if (p.status === 'draft') {
    body = (
      <form
        className="flex flex-col gap-2"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void call('submit', { note: note.trim() || undefined });
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          {t('submitNote')}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={field} />
        </label>
        <p className="text-xs text-muted">{t('submitHint')}</p>
        <button type="submit" disabled={busy} className={`${btn} bg-primary text-white hover:bg-primary-600`}>
          {t('submit')}
        </button>
      </form>
    );
  } else if (p.status === 'in_review' && isReviewer) {
    body = (
      <div className="flex flex-col gap-3">
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-semibold">{t('checklistTitle')}</legend>
          {p.checklist.map((k) => (
            <label key={k} className="flex items-start gap-2 text-sm leading-snug">
              <input
                type="checkbox"
                checked={ticked.includes(k)}
                onChange={(e) => setTicked((prev) => (e.target.checked ? [...prev, k] : prev.filter((x) => x !== k)))}
                className="mt-0.5 size-4 shrink-0 accent-primary"
              />
              {t(`check.${k}`)}
            </label>
          ))}
          <p className="text-xs text-muted">{t('checklistHint')}</p>
        </fieldset>
        {p.needsEffectiveDate && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">{t('effectiveFrom')}</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
            <span className="text-xs text-muted">{t('effectiveHint')}</span>
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm">
          {t('comment')}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={field} />
        </label>
        {p.isSubmitter && <p className="text-xs text-warning">{t('sameSubmitter')}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy || !canApprove} onClick={() => decide('approve')} className={`${btn} bg-success text-white`}>
            {t('approve')}
          </button>
          <button type="button" disabled={busy} onClick={() => decide('request_changes')} className={`${btn} border border-border-strong hover:bg-surface-2`}>
            {t('requestChanges')}
          </button>
          <button type="button" disabled={busy} onClick={() => decide('reject')} className={`${btn} text-danger hover:bg-danger-050`}>
            {t('reject')}
          </button>
        </div>
      </div>
    );
  } else if (p.status === 'published' && isReviewer) {
    body = (
      <form
        className="flex flex-col gap-2"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (!note.trim()) return setMessage({ ok: false, text: t('commentRequired') });
          void call('archive', { comment: note.trim() });
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          {t('archiveReason')}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={field} />
        </label>
        <button type="submit" disabled={busy} className={`${btn} border border-danger/40 text-danger hover:bg-danger-050`}>
          {t('archive')}
        </button>
      </form>
    );
  } else if (p.status === 'in_review') {
    body = <p className="text-sm text-muted">{t('notAllowed')}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {body}
      {message && (
        <p role="status" className={`text-sm ${message.ok ? 'text-success' : 'text-danger'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
