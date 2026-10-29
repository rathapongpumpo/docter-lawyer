'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Loader2, Lock, Trash2, Upload, Users } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { cardClass, errorClass, inputClass, noticeClass } from '@/components/account/styles';
import { ConfirmDialog } from '@/components/shell/ConfirmDialog';
import { apiFetch } from '@/lib/client/api';
import { CSRF_HEADER, readCsrfCookie } from '@/lib/csrf';

export type ContractItem = {
  id: string; file_name: string; type: 'pdf' | 'docx'; size_bytes: number; page_count: number | null; status: string; visibility: 'private' | 'org';
  mine: boolean; uploader: string | null; counterparty_hint: string | null; created_at: string;
};
const ERRORS = ['TOO_LARGE', 'TOO_MANY_PAGES', 'UNSUPPORTED_TYPE', 'INFECTED', 'ENCRYPTED', 'UNREADABLE', 'EMPTY', 'SCAN_UNAVAILABLE', 'STORAGE_UNAVAILABLE', 'NO_FILE'];

// /contracts (FR-CR-001, FR-CR-012): upload a PDF/DOCX, see the organization's contracts with their processing state.
export function ContractsView({ maxMb, maxPages, canRemoveAny }: { maxMb: number; maxPages: number; canRemoveAny: boolean }) {
  const t = useTranslations('contracts');
  const locale = useLocale();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [drag, setDrag] = useState(false);
  const [removing, setRemoving] = useState<ContractItem | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const { data, isPending } = useQuery({
    queryKey: ['contracts', q],
    queryFn: () => apiFetch<{ contracts: ContractItem[] }>(`/api/v1/contracts${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`),
    // while a file is still being read the list refreshes itself
    refetchInterval: (query) => (query.state.data?.contracts.some((c) => c.status === 'uploaded' || c.status === 'extracting' || c.status === 'reviewing') ? 2000 : false),
  });

  async function upload(file: File) {
    setError(null);
    setDone(false);
    setBusy(true);
    const body = new FormData();
    body.append('file', file);
    try {
      const res = await fetch('/api/v1/contracts', { method: 'POST', body, credentials: 'same-origin', headers: { [CSRF_HEADER]: readCsrfCookie() } });
      const json = (await res.json().catch(() => null)) as { success: boolean; error?: string } | null;
      if (!res.ok || !json?.success) {
        const code = ERRORS.includes(json?.error ?? '') ? json!.error! : res.status === 413 ? 'TOO_LARGE' : 'GENERIC';
        setError((t as unknown as (k: string, v?: Record<string, number>) => string)(`errors.${code}`, { mb: maxMb, pages: maxPages }));
      } else {
        setDone(true);
        await qc.invalidateQueries({ queryKey: ['contracts'] });
      }
    } catch {
      setError(t('errors.GENERIC'));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }
  const onPick = (e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) void upload(f); };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) void upload(f); };
  const date = (iso: string) => new Date(iso).toLocaleDateString(locale === 'th' ? 'th-TH-u-ca-buddhist' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' });
  const size = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
  const list = data?.contracts ?? [];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4 sm:p-6">
        <h1 className="font-serif text-2xl font-bold">{t('title')}</h1>
        <p className="rounded-lg bg-warning-050 px-4 py-3 text-sm text-warning">{t('phaseNotice')}</p>

        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}
          className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center ${drag ? 'border-primary bg-primary-050' : 'border-border-strong bg-surface'}`}
        >
          {busy ? <Loader2 className="size-8 animate-spin text-primary-700" aria-hidden="true" /> : <Upload className="size-8 text-primary-700" aria-hidden="true" />}
          <p className="font-semibold">{busy ? t('uploading') : t('drop')}</p>
          <p className="text-sm text-muted">{t('limits', { mb: maxMb, pages: maxPages })}</p>
          <input ref={input} id="contract-file" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={onPick} className="sr-only" />
          <label htmlFor="contract-file" className="inline-flex h-11 cursor-pointer items-center rounded-[10px] bg-primary px-5 font-semibold text-white hover:bg-primary-600 focus-within:ring-2">{t('choose')}</label>
          <p className="max-w-xl text-xs text-muted">{t('privacy')}</p>
        </div>
        {error && <p role="alert" className={errorClass}>{error}</p>}
        {done && <p role="status" className={noticeClass}>{t('uploaded')}</p>}

        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('search')} placeholder={t('search')} className={inputClass} />
        <section className={cardClass} aria-label={t('list')}>
          {isPending ? <p className="text-muted">…</p> : list.length === 0 ? <p className="text-muted">{q ? t('noMatch') : t('empty')}</p> : (
            <ul className="flex flex-col divide-y divide-border">
              {list.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
                  <FileText className="size-5 shrink-0 text-muted" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <Link href={`/contracts/${c.id}`} className="block truncate font-medium hover:underline">{c.file_name}</Link>
                    <span className="block text-sm text-muted">
                      {c.type.toUpperCase()} · {size(c.size_bytes)}{c.page_count ? ` · ${t('pages', { n: c.page_count })}` : ''} · {date(c.created_at)}
                      {c.uploader ? ` · ${c.uploader}` : ''}
                      {c.counterparty_hint ? ` · ${c.counterparty_hint}` : ''}
                    </span>
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted" title={c.visibility === 'org' ? t('visOrg') : t('visPrivate')}>
                    {c.visibility === 'org' ? <Users className="size-3.5" aria-hidden="true" /> : <Lock className="size-3.5" aria-hidden="true" />}
                    {c.visibility === 'org' ? t('visOrg') : t('visPrivate')}
                  </span>
                  <StatusBadge status={c.status} />
                  {(c.mine || canRemoveAny) && (
                    <button type="button" onClick={() => setRemoving(c)} aria-label={t('delete', { name: c.file_name })} className="flex size-9 items-center justify-center rounded-lg text-danger hover:bg-danger-050"><Trash2 className="size-4" aria-hidden="true" /></button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {removing && (
        <ConfirmDialog title={t('deleteTitle')} confirmLabel={t('deleteConfirm')} onCancel={() => setRemoving(null)}
          onConfirm={async () => { const c = removing; setRemoving(null); await apiFetch(`/api/v1/contracts/${c.id}`, { method: 'DELETE' }); await qc.invalidateQueries({ queryKey: ['contracts'] }); }}>
          {t('deleteText', { name: removing.file_name })}
        </ConfirmDialog>
      )}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('contracts.status');
  const tone = status === 'ready' || status === 'reviewed' ? 'bg-success-050 text-success' : status === 'failed' || status === 'unsupported_scan' ? 'bg-danger-050 text-danger' : 'bg-warning-050 text-warning';
  return <span className={`rounded-full px-3 py-1 text-xs ${tone}`}>{t(status as never)}</span>;
}
