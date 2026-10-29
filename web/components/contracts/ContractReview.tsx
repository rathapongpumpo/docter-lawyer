'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FlaskConical, Info, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { cardClass, errorClass, primaryBtn, secondaryBtn } from '@/components/account/styles';
import { Markdown } from '@/components/chat/Markdown';
import { countByRisk, filterByRisk, ratedLevels, sortFindings, type Finding, type ReviewMode, type ReviewView, type Risk } from '@/lib/contract-review-shared';
import { apiFetch } from '@/lib/client/api';
import { CSRF_HEADER, readCsrfCookie } from '@/lib/csrf';

type Clause = { ref: string; title: string; page: number | null };
type T = (key: string, values?: Record<string, string | number>) => string;
// Codes with a message in messages/*.json (contracts.review.errors); anything else is shown as GENERIC
const ERROR_CODES = ['GENERIC', 'REVIEW_DISABLED', 'NOT_READY', 'REVIEW_RUNNING', 'REVIEW_QUOTA', 'UPLOADS_PAUSED', 'RATE_LIMITED', 'REVIEW_UNAVAILABLE', 'REVIEW_TIMEOUT',
  'REVIEW_AUTH', 'REVIEW_BUSY', 'REVIEW_BAD_RESPONSE', 'REVIEW_TOO_LARGE', 'REVIEW_INTERNAL', 'REVIEW_NO_ANSWER', 'REVIEW_STALE'];
const known = (k: string | null | undefined) => (k && ERROR_CODES.includes(k) ? k : 'GENERIC');

type Level = Exclude<Risk, 'unrated'>;
const TONE: Record<Level, string> = {
  high: 'bg-danger-050 text-danger',
  medium: 'bg-warning-050 text-warning',
  low: 'bg-primary-050 text-primary-700',
  none: 'bg-success-050 text-success',
};
const ICON = { high: ShieldAlert, medium: AlertTriangle, low: Info, none: CheckCircle2 } as const;
const LONG_ANSWER = 500;   // characters; a longer answer is collapsed until "show all"

// Text + icon + colour: the level never relies on colour alone.
export function RiskBadge({ risk }: { risk: Level }) {
  const t = useTranslations('contracts.review.risk');
  const Icon = ICON[risk];
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${TONE[risk]}`}><Icon className="size-3.5" aria-hidden="true" />{t(risk)}</span>;
}

// The answer of the company service for one clause (backend `pnc`): markdown through the sanitizing renderer, collapsed when long.
function Answer({ text }: { text: string }) {
  const t = useTranslations('contracts.review');
  const long = text.length > LONG_ANSWER || text.split('\n').length > 10;
  const [open, setOpen] = useState(false);
  const collapsed = long && !open;
  return (
    <div>
      <div className={collapsed ? 'max-h-40 overflow-hidden [mask-image:linear-gradient(to_bottom,black_75%,transparent)]' : undefined}><Markdown text={text} /></div>
      {long && (
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="mt-2 inline-flex min-h-8 items-center text-sm leading-normal font-semibold text-primary-700 underline underline-offset-2">
          {open ? t('showLess') : t('showAll')}
        </button>
      )}
    </div>
  );
}

function FindingBody({ f }: { f: Finding }) {
  const t = useTranslations('contracts.review');
  if (f.state === 'no_answer') return <p className="text-sm text-muted">{t('noAnswer')}</p>;
  return (
    <>
      {f.note && (f.risk === 'unrated' ? <Answer text={f.note} /> : <p className="[overflow-wrap:anywhere]">{f.note}</p>)}
      {f.suggestion && <p className="text-sm [overflow-wrap:anywhere]"><b>{t('suggestion')}:</b> {f.suggestion}</p>}
    </>
  );
}

// Result of the review of one contract (M12): key terms, then findings per clause with a filter by level. The panel exists only when the
// review backend is switched on (the page does not render it otherwise).
export function ContractReview({ id, mode, clauses, canStart }: { id: string; mode: Exclude<ReviewMode, 'off'>; clauses: Clause[]; canStart: boolean }) {
  const t = useTranslations('contracts.review');
  const tt = t as unknown as T;
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [filter, setFilter] = useState<Risk | null>(null);
  const { data } = useQuery({
    queryKey: ['contract-review', id], retry: false,
    queryFn: () => apiFetch<{ mode: ReviewMode; review: ReviewView | null }>(`/api/v1/contracts/${id}/review`),
    refetchInterval: (q) => { const r = q.state.data?.review; return r && (r.status === 'queued' || r.status === 'running') && !r.stale ? 2000 : false; },
  });
  const review = data?.review ?? null;
  const running = !!review && (review.status === 'queued' || review.status === 'running') && !review.stale;
  const phase = review?.status;
  // when a run ends, the contract row (its status badge) has changed as well
  useEffect(() => { if (phase === 'completed' || phase === 'failed') void qc.invalidateQueries({ queryKey: ['contract', id] }); }, [phase, qc, id]);

  async function start() {
    setError(null);
    setStarting(true);
    try {
      const res = await fetch(`/api/v1/contracts/${id}/review`, { method: 'POST', body: '{}', credentials: 'same-origin', headers: { 'content-type': 'application/json', [CSRF_HEADER]: readCsrfCookie() } });
      const json = (await res.json().catch(() => null)) as { success: boolean; error?: string; error_code?: string } | null;
      if (!res.ok || !json?.success) {
        setError(tt(`errors.${json?.error_code === 'rate_limited' ? 'RATE_LIMITED' : known(json?.error)}`));
      } else {
        await Promise.all([qc.invalidateQueries({ queryKey: ['contract-review', id] }), qc.invalidateQueries({ queryKey: ['contract', id] })]);
      }
    } catch {
      setError(t('errors.GENERIC'));
    } finally {
      setStarting(false);
    }
  }
  const failedKey = review?.status === 'failed' ? known(review.error_code) : null;
  const findings = review?.status === 'completed' ? sortFindings(review.findings) : [];
  const counts = countByRisk(findings);
  const shown = filterByRisk(findings, filter);
  const levels = ratedLevels(findings);   // no filter when nothing has a level (backend pnc)
  const pnc = review?.backend === 'pnc';
  const notChecked = review?.summary?.not_checked ?? 0;
  const parties = review?.summary?.parties ?? [];

  return (
    <section className={cardClass} aria-labelledby="review-title">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="review-title" className="min-w-0 flex-1 text-lg font-bold">{t('title')}</h2>
        {review?.status === 'completed' && review.backend === 'mock' && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-warning bg-warning-050 px-3 py-1 text-xs font-semibold text-warning">
            <FlaskConical className="size-3.5" aria-hidden="true" />{t('mockBadge')}
          </span>
        )}
        {canStart && !running && (
          <button type="button" onClick={() => void start()} disabled={starting} className={review && review.status === 'completed' ? secondaryBtn : primaryBtn}>
            {starting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="size-4" aria-hidden="true" />}
            {review && (review.stale || (review.status !== 'queued' && review.status !== 'running')) ? t('again') : t('start')}
          </button>
        )}
      </div>
      {!review && <p className="text-sm text-muted">{t(mode === 'pnc' ? 'hintPnc' : 'hint')}</p>}
      {(mode === 'http' || mode === 'pnc') && canStart && !running && <p className="text-xs text-muted">{t(mode === 'pnc' ? 'privacyPnc' : 'privacyHttp')}</p>}
      {error && <p role="alert" className={errorClass}>{error}</p>}
      {(running || starting) && <p role="status" className="flex items-center gap-2 text-muted"><Loader2 className="size-4 animate-spin" aria-hidden="true" />{t(mode === 'pnc' ? 'runningPnc' : 'running')}</p>}
      {review?.stale && <p role="alert" className={errorClass}>{t('stale')}</p>}
      {failedKey && <p role="alert" className={errorClass}>{tt(`errors.${failedKey}`)}</p>}

      {review?.status === 'completed' && review.summary && (
        <>
          {/* backend pnc gives no key terms: only the parties our own reader found are shown (an unverified hint) */}
          {(!pnc || parties.length > 0) && (
            <div className="rounded-xl border border-border bg-surface-2 p-4">
              <h3 className="font-bold">{t('summary')}</h3>
              <p className="mb-3 text-xs text-muted">{t('summaryHint')}</p>
              <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
                {(pnc ? [['parties', parties.join(' / ') || null]] as const
                  : ([['parties', parties.join(' / ') || null], ['term', review.summary.term], ['payment', review.summary.payment],
                    ['termination', review.summary.termination], ['penalty', review.summary.penalty], ['governingLaw', review.summary.governing_law]] as const)).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="font-semibold">{t(k)}</dt>
                    <dd className="[overflow-wrap:anywhere]">{v ?? <span className="text-muted">{t('notFound')}</span>}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          <h3 className="font-bold">{t('findings')}</h3>
          {notChecked > 0 && <p role="note" className="text-sm text-warning">{t('notChecked', { checked: findings.length, count: notChecked })}</p>}
          {levels.length > 0 && (
            <div role="group" aria-label={t('filter')} className="flex flex-wrap gap-2">
              {[null, ...levels].map((r) => (
                <button key={r ?? 'all'} type="button" aria-pressed={filter === r} onClick={() => setFilter(r)}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm ${filter === r ? 'border-primary bg-primary-050 font-semibold text-primary-700' : 'border-border-strong bg-surface text-text hover:bg-surface-2'}`}>
                  {r ? t(`risk.${r}`) : t('all')} <span className="text-muted">({r ? counts[r] : findings.length})</span>
                </button>
              ))}
            </div>
          )}
          {shown.length === 0 ? <p className="text-muted">{t('noMatch')}</p> : (
            <ul className="flex flex-col gap-3">
              {shown.map((f) => {
                const cl = clauses[f.idx];
                return (
                  <li key={`${f.idx}-${f.clause_no}`} className="flex flex-col gap-2 rounded-xl border border-border p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="min-w-0 flex-1 font-semibold">{f.clause_no}{cl?.title ? ` — ${cl.title}` : ''}</h4>
                      {f.risk !== 'unrated' && <RiskBadge risk={f.risk} />}
                    </div>
                    <FindingBody f={f} />
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      <p className="text-xs text-muted">{t('disclaimer')}</p>
    </section>
  );
}
