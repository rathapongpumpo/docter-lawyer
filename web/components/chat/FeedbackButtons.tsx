'use client';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState, type FormEvent } from 'react';
import { errorClass, primaryBtn, secondaryBtn } from '@/components/account/styles';
import { apiFetch } from '@/lib/client/api';
import type { Feedback } from '@/lib/client/chat-store';
import { useDismiss } from '@/lib/client/use-dismiss';

const REASONS = ['incorrect', 'incomplete', 'hard_to_understand', 'off_topic', 'outdated', 'missing_citation', 'unsafe', 'other'] as const;

// 👍 saves at once and pressing it again withdraws it; 👎 asks for reasons, a comment and permission for the legal team to read the chat (FR-CHAT-016).
export function FeedbackButtons({ messageId, value, onChange }: { messageId: number; value: Feedback | null; onChange: (f: Feedback | null) => void }) {
  const t = useTranslations('chat.feedback');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLFormElement>(null);
  useDismiss(() => setOpen(false), { active: open, containerRef: panel, returnFocusTo: toggle });
  const btn = (active: boolean) => `flex size-8 items-center justify-center rounded-lg hover:bg-surface-2 ${active ? 'bg-primary-050 text-primary-700' : ''}`;

  async function thumbsUp() {
    setError(null);
    try {
      if (value?.rating === 1) {
        await apiFetch(`/api/v1/messages/${messageId}/feedback`, { method: 'DELETE' });
        onChange(null);
      } else {
        await apiFetch(`/api/v1/messages/${messageId}/feedback`, { method: 'PUT', body: JSON.stringify({ rating: 1 }) });
        onChange({ rating: 1, reasons: [], comment: null, allow_review: false });
      }
      setOpen(false);
    } catch { setError(t('error')); }
  }
  async function submitDown(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const reasons = f.getAll('reason').map(String);
    const comment = String(f.get('comment') ?? '').trim();
    const allow = f.get('allow') === 'on';
    setError(null);
    try {
      await apiFetch(`/api/v1/messages/${messageId}/feedback`, { method: 'PUT', body: JSON.stringify({ rating: -1, reasons, comment: comment || undefined, allow_review: allow }) });
      onChange({ rating: -1, reasons, comment: comment || null, allow_review: allow });
      setOpen(false);
    } catch { setError(t('error')); }
  }

  return (
    <div className="relative flex items-center gap-1">
      <button type="button" onClick={() => void thumbsUp()} aria-pressed={value?.rating === 1} aria-label={t('up')} title={t('up')} className={btn(value?.rating === 1)}><ThumbsUp className="size-4" aria-hidden="true" /></button>
      <button ref={toggle} type="button" onClick={() => setOpen((v) => !v)} aria-pressed={value?.rating === -1} aria-expanded={open} aria-label={t('down')} title={t('down')} className={btn(value?.rating === -1)}><ThumbsDown className="size-4" aria-hidden="true" /></button>
      {open && (
        <form ref={panel} onSubmit={submitDown} role="dialog" aria-label={t('title')} className="absolute bottom-10 left-0 z-30 flex w-[min(20rem,85vw)] flex-col gap-3 rounded-xl border border-border-strong bg-surface p-4 text-text shadow-lg">
          <p className="font-semibold">{t('title')}</p>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="sr-only">{t('reasons')}</legend>
            {REASONS.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="reason" value={r} defaultChecked={value?.reasons.includes(r)} className="size-4 accent-primary" />
                {t(`reason.${r}` as never)}
              </label>
            ))}
          </fieldset>
          <label className="flex flex-col gap-1 text-sm font-medium">{t('comment')}
            <textarea name="comment" rows={3} maxLength={1000} defaultValue={value?.comment ?? ''} className="rounded-lg border border-border-strong bg-surface p-2 text-sm font-normal" />
          </label>
          <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" name="allow" defaultChecked={value?.allow_review} className="mt-0.5 size-4 shrink-0 accent-primary" />
            {t('allowReview')}
          </label>
          {error && <p role="alert" className={errorClass}>{error}</p>}
          <div className="flex gap-2"><button type="submit" className={primaryBtn}>{t('send')}</button><button type="button" className={secondaryBtn} onClick={() => setOpen(false)}>{t('cancel')}</button></div>
        </form>
      )}
      {error && !open && <span role="alert" className="text-xs text-danger">{error}</span>}
    </div>
  );
}
