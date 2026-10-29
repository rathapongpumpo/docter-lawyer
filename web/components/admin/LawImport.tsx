'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { errorClass, inputClass, noticeClass, primaryBtn, secondaryBtn } from '@/components/account/styles';
import { CSRF_HEADER, readCsrfCookie } from '@/lib/csrf';
import { apiFetch } from '@/lib/client/api';
import { AdminPage, selectClass } from './ui';

type Law = { law_code: string; title_th: string; short_name_th: string | null; versions: number };
type Sec = { no: string; body: string; structure: { level: string; no: string }[]; repealed: boolean };
type Parsed = { stage: 'parsed'; law_code: string; law_title: string; version_label: string; file_name: string; sections: Sec[]; warnings: string[]; diff: { added: string[]; amended: string[]; repealed: string[] } | null; compared_with_existing: boolean };
type Job = { id: number; status: string; result: (Parsed | { stage: 'failed'; error: string } | { stage: 'committed'; law_version_id: number; sections: number }) | null; error: string | null };
const ERRORS = ['EMPTY', 'TOO_LARGE', 'UNSUPPORTED_TYPE', 'VERSION_LABEL_EXISTS', 'STORAGE_UNAVAILABLE', 'NO_FILE', 'BAD_FIELDS'];

// FR-ADM-008/009: upload a statute → check the parsed table → save as a draft version that a reviewer approves.
export function LawImport({ laws }: { laws: Law[] }) {
  const t = useTranslations('admin.laws');
  const [jobId, setJobId] = useState<number | null>(null);
  const [commitId, setCommitId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [exclude, setExclude] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);

  const { data: job } = useQuery({
    queryKey: ['law-import', jobId], enabled: !!jobId,
    queryFn: () => apiFetch<Job>(`/api/v1/admin/laws/import/${jobId}`),
    refetchInterval: (q) => (q.state.data && (q.state.data.status === 'done' || q.state.data.status === 'dead') ? false : 1500),
  });
  const { data: commit } = useQuery({
    queryKey: ['law-commit', commitId], enabled: !!commitId,
    queryFn: () => apiFetch<Job>(`/api/v1/admin/laws/import/${commitId}`),
    refetchInterval: (q) => (q.state.data && (q.state.data.status === 'done' || q.state.data.status === 'dead') ? false : 1500),
  });
  const parsed = job?.result?.stage === 'parsed' ? (job.result as Parsed) : null;
  const failed = job?.result?.stage === 'failed' ? (job.result as { error: string }).error : job?.status === 'dead' ? 'DEAD' : null;
  const done = commit?.result?.stage === 'committed' ? (commit.result as { law_version_id: number; sections: number }) : null;
  const commitFailed = commit?.result?.stage === 'failed' ? (commit.result as { error: string }).error : commit?.status === 'dead' ? 'DEAD' : null;

  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null); setBusy(true); setJobId(null); setCommitId(null); setOverrides({}); setExclude(new Set());
    const res = await fetch('/api/v1/admin/laws/import', { method: 'POST', body: new FormData(e.currentTarget), credentials: 'same-origin', headers: { [CSRF_HEADER]: readCsrfCookie() } });
    const json = (await res.json().catch(() => null)) as { success: boolean; data?: { job_id: number }; error?: string } | null;
    setBusy(false);
    if (!res.ok || !json?.success) return setError(t(`errors.${ERRORS.includes(json?.error ?? '') ? json!.error : 'GENERIC'}` as never));
    setJobId(json.data!.job_id);
  }
  async function save() {
    setError(null);
    try {
      const r = await apiFetch<{ job_id: number }>(`/api/v1/admin/laws/import/${jobId}/commit`, { method: 'POST', body: JSON.stringify({ overrides, exclude: [...exclude] }) });
      setCommitId(r.job_id);
    } catch { setError(t('errors.GENERIC')); }
  }
  const status = (s: Sec) => (exclude.has(s.no) ? 'excluded' : overrides[s.no] !== undefined ? 'edited' : s.repealed ? 'repealed' : parsed?.diff?.added.includes(s.no) ? 'added' : parsed?.diff?.amended.includes(s.no) ? 'amended' : 'ok');

  return (
    <AdminPage title={t('title')} intro={t('intro')}>
      <form onSubmit={upload} className="flex max-w-3xl flex-col gap-3 rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">{t('law')}<select name="law_code" required className={selectClass}>{laws.map((l) => <option key={l.law_code} value={l.law_code}>{l.short_name_th ?? l.law_code} — {l.title_th}</option>)}</select></label>
          <label className="flex min-w-64 flex-1 flex-col gap-1 text-sm font-medium">{t('label')}<input name="version_label" required minLength={3} maxLength={200} placeholder={t('labelHint')} className={inputClass} /></label>
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium">{t('file')}<input name="file" type="file" accept=".pdf,.txt,.htm,.html,application/pdf,text/plain,text/html" className="text-sm font-normal" /></label>
        <label className="flex flex-col gap-1 text-sm font-medium">{t('or')}<textarea name="text" rows={4} className="rounded-lg border border-border-strong bg-surface p-2 font-normal" /></label>
        <p className="text-xs text-muted">{t('hint')}</p>
        {error && <p role="alert" className={errorClass}>{error}</p>}
        <div><button type="submit" disabled={busy} className={primaryBtn}>{busy ? t('uploading') : t('parse')}</button></div>
      </form>

      {jobId && !parsed && !failed && <p role="status" className="text-muted">{t('parsing')}</p>}
      {failed && <p role="alert" className={errorClass}>{(t as unknown as (k: string, v?: Record<string, string>) => string)(`parseErrors.${['unknown_law', 'too_many_sections', 'DEAD'].includes(failed) ? failed : 'other'}`, { detail: failed })}</p>}

      {parsed && !done && (
        <section aria-label={t('result')} className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">{t('result')}: {parsed.law_title}</h2>
          <p className="text-sm">{t('found', { n: parsed.sections.length })}{parsed.diff ? ` · ${t('diff', { added: parsed.diff.added.length, amended: parsed.diff.amended.length, repealed: parsed.diff.repealed.length })}` : ` · ${t('noPrevious')}`}</p>
          {parsed.warnings.length > 0 && (
            <ul role="alert" className="list-disc rounded-lg bg-warning-050 py-2 pr-3 pl-7 text-sm text-warning">{parsed.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          )}
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">{t('verifyNote')}</p>
          <div className="max-h-[32rem] overflow-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="sticky top-0 bg-surface-2 text-xs text-muted"><tr><th className="px-3 py-2 text-left">{t('section')}</th><th className="px-3 py-2 text-left">{t('text')}</th><th className="px-3 py-2 text-left">{t('state')}</th><th className="px-3 py-2"></th></tr></thead>
              <tbody className="divide-y divide-border">
                {parsed.sections.map((s) => (
                  <tr key={s.no} className={exclude.has(s.no) ? 'opacity-50' : ''}>
                    <td className="px-3 py-2 align-top font-mono whitespace-nowrap">{s.no}</td>
                    <td className="px-3 py-2 align-top">
                      {open === s.no ? (
                        <textarea aria-label={t('editSection', { no: s.no })} value={overrides[s.no] ?? s.body} rows={6} onChange={(e) => setOverrides((o) => ({ ...o, [s.no]: e.target.value }))} className="w-full rounded-lg border border-border-strong bg-surface p-2 text-sm" />
                      ) : <span className="line-clamp-2 whitespace-pre-wrap">{overrides[s.no] ?? s.body}</span>}
                    </td>
                    <td className="px-3 py-2 align-top whitespace-nowrap text-muted">{t(`states.${status(s)}` as never)}</td>
                    <td className="px-3 py-2 align-top whitespace-nowrap">
                      <button type="button" className="text-primary-700 underline" onClick={() => setOpen(open === s.no ? null : s.no)}>{open === s.no ? t('close') : t('edit')}</button>
                      <button type="button" className="ml-3 text-danger underline" onClick={() => setExclude((x) => { const n = new Set(x); if (n.has(s.no)) n.delete(s.no); else n.add(s.no); return n; })}>{exclude.has(s.no) ? t('include') : t('exclude')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {commitFailed && <p role="alert" className={errorClass}>{t(`commitErrors.${['version_label_exists', 'nothing_to_save', 'parse_result_missing'].includes(commitFailed) ? commitFailed : 'other'}` as never)}</p>}
          <div className="flex gap-2"><button type="button" className={primaryBtn} disabled={!!commitId && !commitFailed} onClick={() => void save()}>{commitId && !commitFailed ? t('saving') : t('save')}</button></div>
        </section>
      )}
      {done && (
        <div role="status" className={`${noticeClass} flex flex-wrap items-center gap-3`}>
          {t('saved', { n: done.sections })}
          <Link href={`/admin/review/law_version/${done.law_version_id}`} className={secondaryBtn}>{t('openReview')}</Link>
        </div>
      )}
    </AdminPage>
  );
}
