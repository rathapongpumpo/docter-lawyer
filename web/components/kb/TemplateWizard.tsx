'use client';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Download, Info, Trash2, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Markdown } from '@/components/chat/Markdown';
import { useLocalString, writeLocal } from '@/lib/client/local-store';
import { CSRF_HEADER, readCsrfCookie } from '@/lib/csrf';
import { emptyFieldCount, MAX_ANSWER_CHARS, pageOf, toSegments, type TplField, type TplForm } from '@/lib/template-doc';

type Format = 'docx' | 'pdf';
const ACK_KEY = 'lc.tpl.ack';
const draftKey = (slug: string) => `lc.tpl.draft.${slug}`;
const input = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-[0.9375rem] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';

/** Guided form for a letter template (FR-TPL-002…008): ≤5 fields a page, preview with highlights, then DOCX/PDF. */
export function TemplateWizard({ slug, form, helpMd }: { slug: string; form: TplForm; helpMd: Record<string, string> }) {
  const t = useTranslations('templates');
  const pages = useMemo(() => pageOf(form.fields, 5), [form.fields]);
  const reviewStep = pages.length;
  const [openHelp, setOpenHelp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // Drafts stay in this browser only (nothing about the letter is stored on the server).
  const storedDraft = useLocalString(draftKey(slug));
  const acked = useLocalString(ACK_KEY, true) === '1';
  const answers = useMemo<Record<string, string>>(() => {
    try {
      const saved = storedDraft ? (JSON.parse(storedDraft) as Record<string, unknown>) : {};
      const known = new Set(form.fields.map((f) => f.key));
      return Object.fromEntries(Object.entries(saved).filter(([k, v]) => known.has(k) && typeof v === 'string')) as Record<string, string>;
    } catch { return {}; }
  }, [storedDraft, form.fields]);
  const [step, setStep] = useState(0);

  useEffect(() => {
    heading.current?.focus();
    if (pendingFocus.current) {
      document.getElementById(`tpl-${pendingFocus.current}`)?.focus();
      pendingFocus.current = null;
    }
  }, [step]);

  const segments = useMemo(() => toSegments(form, answers), [form, answers]);
  const empties = emptyFieldCount(form, answers);
  const set = (key: string, value: string) => writeLocal(draftKey(slug), JSON.stringify({ ...answers, [key]: value }));
  const goTo = (key: string) => {
    const idx = pages.findIndex((p) => p.some((f) => f.key === key));
    pendingFocus.current = key;
    setStep(idx < 0 ? 0 : idx);
  };

  const download = useMutation({
    mutationFn: async ({ format, blank }: { format: Format; blank: boolean }) => {
      const res = await fetch(`/api/v1/templates/${slug}/render`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', [CSRF_HEADER]: readCsrfCookie() },
        body: JSON.stringify({ answers: blank ? {} : answers, format }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error_code?: string } | null;
        throw new Error(body?.error_code ?? `http_${res.status}`);
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slug}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onMutate: () => setError(null),
    onError: (e: Error) => setError(e.message === 'rate_limited' ? t('rateLimited') : t('renderFailed')),
  });
  const ack = (v: boolean) => writeLocal(ACK_KEY, v ? '1' : '0', true);
  const clear = () => { writeLocal(draftKey(slug), null); setStep(0); };

  const renderField = (f: TplField) => {
    const id = `tpl-${f.key}`;
    const describedBy = [f.hint ? `${id}-hint` : '', f.help && openHelp === f.key ? `${id}-help` : ''].filter(Boolean).join(' ') || undefined;
    const common = { id, value: answers[f.key] ?? '', maxLength: MAX_ANSWER_CHARS, 'aria-describedby': describedBy, className: input };
    return (
      <div key={f.key} className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={id} className="text-sm font-semibold">
            {f.label}{f.optional && <span className="ml-1.5 font-normal text-muted">{t('optional')}</span>}
          </label>
          {f.help && (
            <button type="button" aria-expanded={openHelp === f.key} aria-label={t('helpFor', { label: f.label })}
              onClick={() => setOpenHelp(openHelp === f.key ? null : f.key)}
              className="inline-flex size-7 items-center justify-center rounded-full text-primary-700 hover:bg-primary-050">
              <Info className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
        {f.kind === 'textarea' ? (
          <textarea {...common} rows={3} onChange={(e) => set(f.key, e.target.value)} />
        ) : (
          <input {...common} type={f.kind === 'date' ? 'date' : 'text'} onChange={(e) => set(f.key, e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} />
        )}
        {f.hint && <p id={`${id}-hint`} className="text-xs text-muted">{f.hint}</p>}
        {f.help && openHelp === f.key && (
          <div id={`${id}-help`} className="rounded-lg bg-primary-050 px-3 py-2 text-sm [&_p]:my-0">
            <Markdown text={helpMd[f.key] ?? f.help} />
          </div>
        )}
      </div>
    );
  };

  const inReview = step === reviewStep;
  return (
    <section aria-labelledby="tpl-wizard-title" className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="tpl-wizard-title" ref={heading} tabIndex={-1} className="font-serif text-lg font-bold outline-none">
          {inReview ? t('reviewTitle') : t('stepTitle', { n: step + 1, total: pages.length })}
        </h2>
        <button type="button" onClick={clear} className="inline-flex items-center gap-1 text-xs text-muted hover:text-danger">
          <Trash2 className="size-3.5" aria-hidden="true" />{t('clearDraft')}
        </button>
      </div>
      <div role="progressbar" aria-valuemin={1} aria-valuemax={pages.length + 1} aria-valuenow={step + 1} aria-label={t('progressLabel')}
        className="flex gap-1">
        {[...pages, null].map((_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-primary' : 'bg-surface-2'}`} />)}
      </div>
      <p className="text-xs text-muted">{t('localDraft')}</p>

      {!inReview ? (
        <>
          <div className="flex flex-col gap-4">{pages[step].map(renderField)}</div>
          <div className="flex justify-between gap-2">
            <button type="button" disabled={step === 0} onClick={() => setStep(step - 1)}
              className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-border px-4 text-sm hover:bg-surface-2 disabled:opacity-40">
              <ArrowLeft className="size-4" aria-hidden="true" />{t('back')}
            </button>
            <button type="button" onClick={() => setStep(step + 1)}
              className="inline-flex h-10 items-center gap-1.5 rounded-[10px] bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-600">
              {step === pages.length - 1 ? t('toReview') : t('next')}<ArrowRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        </>
      ) : (
        <>
          {empties > 0 && (
            <div role="status" className="flex gap-2 rounded-xl border border-warning/40 bg-warning-050 p-3 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
              <p>{t('emptyWarning', { count: empties })}</p>
            </div>
          )}
          <p className="text-xs text-muted">{t('previewHint')}</p>
          <div className="whitespace-pre-wrap rounded-xl border border-border bg-bg p-4 font-serif text-[1.0625rem] leading-relaxed" data-testid="tpl-preview">
            {segments.map((s, i) =>
              s.key ? (
                <button key={i} type="button" onClick={() => goTo(s.key!)} title={t('editField')}
                  className={s.empty ? 'rounded bg-warning-050 px-0.5 text-muted underline decoration-dotted' : 'rounded bg-primary-050 px-0.5 underline decoration-primary/40 decoration-dotted hover:bg-primary/15'}>
                  {s.v}
                </button>
              ) : <span key={i}>{s.v}</span>,
            )}
          </div>
          <div className="rounded-xl bg-surface-2 p-3 text-sm">
            <label className="flex cursor-pointer gap-2.5">
              <input type="checkbox" checked={acked} onChange={(e) => ack(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]" />
              <span>{t('ackDisclaimer')}</span>
            </label>
          </div>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {(['docx', 'pdf'] as const).map((f) => (
              <button key={f} type="button" disabled={!acked || download.isPending} onClick={() => download.mutate({ format: f, blank: false })}
                className="inline-flex h-10 items-center gap-2 rounded-[10px] bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-50">
                <Download className="size-4" aria-hidden="true" />{t(f === 'docx' ? 'downloadDocx' : 'downloadPdf')}
              </button>
            ))}
            <button type="button" onClick={() => setStep(reviewStep - 1)}
              className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-border px-4 text-sm hover:bg-surface-2">
              <ArrowLeft className="size-4" aria-hidden="true" />{t('back')}
            </button>
          </div>
          <p className="text-xs text-muted">
            {t('blankPrefix')}{' '}
            {(['docx', 'pdf'] as const).map((f, i) => (
              <span key={f}>
                {i > 0 && ' · '}
                <button type="button" disabled={!acked || download.isPending} onClick={() => download.mutate({ format: f, blank: true })}
                  className="text-primary-700 underline underline-offset-2 disabled:opacity-50">{f.toUpperCase()}</button>
              </span>
            ))}
          </p>
        </>
      )}
    </section>
  );
}
