'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { diffLines } from 'diff';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { errorClass, inputClass, noticeClass, primaryBtn, secondaryBtn } from '@/components/account/styles';
import { Markdown } from '@/components/chat/Markdown';
import type { RefIndex } from '@/lib/kb';
import { expandRefs } from '@/lib/kb-refs';
import { apiFetch } from '@/lib/client/api';
import { StatusPill as StatusBadge } from './StatusPill';
import { AdminPage } from './ui';

type Precheck = { unknown_law_refs: string[]; unknown_other_refs: string[]; numbers_to_verify: string[]; guarantees: string[]; has_lawyer_section: boolean; law_ref_count: number };
type Detail = {
  type: 'article' | 'guide' | 'template' | 'glossary'; id: number; slug: string; status: 'draft' | 'in_review' | 'published' | 'archived'; version_no: number; updated_at: string; edited_in_app: boolean;
  fields: { title: string; summary?: string | null; body?: string; term_th?: string; term_en?: string | null; short_def?: string; aliases?: string[]; long_def_md?: string | null };
  versions: { id: number; version_no: number; status: string; title: string; body: string; updated_at: string }[]; precheck: Precheck;
};
type Section = { law_code: string; short: string; section_no: string };
const AUTOSAVE_MS = 10_000;

// FR-ADM-002/003/005: Markdown editor with live preview, citation helper, deterministic pre-check, autosave, versions and diff.
export function ContentEditor({ type, id, refs }: { type: Detail['type']; id: number; refs: RefIndex }) {
  const t = useTranslations('admin.content');
  const router = useRouter();
  const qc = useQueryClient();
  const { data, isError } = useQuery({ queryKey: ['admin-content-item', type, id], retry: false, queryFn: () => apiFetch<Detail>(`/api/v1/admin/content-items/${type}/${id}`) });
  if (isError) return <AdminPage title={t('title')}><p className="text-muted">{t('notFound')} <Link href="/admin/content" className="text-primary-700 underline">{t('back')}</Link></p></AdminPage>;
  if (!data) return <AdminPage title={t('title')}><p className="text-muted">…</p></AdminPage>;
  return <Editor key={`${data.id}`} d={data} refs={refs} onReload={() => qc.invalidateQueries({ queryKey: ['admin-content-item', type, id] })} onOpen={(newId) => router.push(`/admin/content/${type}/${newId}`)} />;
}

// The page title is its own field and the reader's page drops a leading "# title" line, so the editor does not show it either.
const withoutTitleLine = (body: string | undefined, title: string) => {
  const m = body?.match(/^\s*#\s([^\n]*)\n+/);
  return body && m && m[1].trim() === title.trim() ? body.slice(m[0].length) : body;
};

function Editor({ d, refs, onReload, onOpen }: { d: Detail; refs: RefIndex; onReload: () => void; onOpen: (id: number) => void }) {
  const t = useTranslations('admin.content');
  const tk = useTranslations('kb');
  const editable = d.status === 'draft';
  const glossary = d.type === 'glossary';
  const [f, setF] = useState(() => ({ ...d.fields, body: withoutTitleLine(d.fields.body, d.fields.title) }));
  const [stamp, setStamp] = useState(d.updated_at);
  const [dirty, setDirty] = useState(false);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'stale' | 'error'>('idle');
  const [pre, setPre] = useState<Precheck>(d.precheck);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [diffWith, setDiffWith] = useState<number | null>(null);
  const [cite, setCite] = useState('');
  const [hits, setHits] = useState<Section[]>([]);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  // the preview shows what readers will see: references become names and links, editor notes disappear
  const preview = expandRefs(f.body ?? '', {
    ...refs,
    section: (law, section, paragraph) => tk('sectionShort', { law, section }) + (paragraph ? ` ${tk('paragraph', { n: String(paragraph) })}` : ''),
    guide: (title) => tk('guideLink', { title }),
    template: (title) => tk('templateLink', { title }),
  });
  const latest = useRef({ f, stamp, dirty });
  useEffect(() => { latest.current = { f, stamp, dirty }; });

  const save = useCallback(async () => {
    if (!latest.current.dirty) return;
    setState('saving');
    try {
      const { f: cur, stamp: ts } = latest.current;
      const payload = glossary
        ? { term_th: cur.term_th, term_en: cur.term_en ?? null, short_def: cur.short_def, aliases: cur.aliases, long_def_md: cur.long_def_md ?? null }
        : { title: cur.title, summary: d.type === 'guide' || d.type === 'article' ? (cur.summary ?? null) : undefined, body: cur.body };
      const r = await apiFetch<{ updated_at: string; precheck: Precheck | null }>(`/api/v1/admin/content-items/${d.type}/${d.id}`, { method: 'PUT', body: JSON.stringify({ if_updated_at: ts, ...payload }) });
      setStamp(r.updated_at);
      if (r.precheck) setPre(r.precheck);
      setDirty(false);
      setState('saved');
    } catch (err) {
      setState((err as Error).message === 'conflict' ? 'stale' : 'error');
    }
  }, [d.id, d.type, glossary]);

  // autosave every 10 seconds while there are unsaved changes (FR-ADM-002 AC2)
  useEffect(() => {
    if (!editable) return;
    const id = setInterval(() => void save(), AUTOSAVE_MS);
    return () => clearInterval(id);
  }, [editable, save]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (latest.current.dirty) e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  function change(patch: Partial<Detail['fields']>) { setF((cur) => ({ ...cur, ...patch })); setDirty(true); setState('idle'); }
  useEffect(() => {
    if (!cite.trim()) return;
    const id = setTimeout(async () => { try { setHits((await apiFetch<{ sections: Section[] }>(`/api/v1/admin/content-items/law-sections?q=${encodeURIComponent(cite)}`)).sections); } catch { setHits([]); } }, 250);
    return () => clearTimeout(id);
  }, [cite]);
  function insertRef(s: Section) {
    const ta = bodyRef.current;
    const token = `[[law:${s.law_code}:${s.section_no}]]`;
    const body = f.body ?? '';
    const at = ta ? ta.selectionStart : body.length;
    change({ body: body.slice(0, at) + token + body.slice(at) });
    setCite(''); setHits([]);
  }

  async function submit() {
    await save();
    try {
      await apiFetch(`/api/v1/admin/content/${d.id}/submit`, { method: 'POST', body: JSON.stringify({ type: d.type, note: t('submitNote') }) });
      setMsg({ ok: true, text: t('submitted') });
      onReload();
    } catch { setMsg({ ok: false, text: t('submitFailed') }); }
  }
  async function revise(fromId: number) {
    try {
      const r = await apiFetch<{ id: number }>(`/api/v1/admin/content-items/${d.type}/${fromId}/revise`, { method: 'POST' });
      onOpen(r.id);
    } catch (err) {
      const m = (err as Error).message;
      setMsg({ ok: false, text: m === 'conflict' ? t('draftExists') : t('error') });
    }
  }
  const diffTarget = d.versions.find((v) => v.id === diffWith);
  const warnings = pre.unknown_law_refs.length + pre.unknown_other_refs.length + pre.guarantees.length + (pre.has_lawyer_section || glossary ? 0 : 1);

  return (
    <AdminPage title={f.title || t('title')} actions={<Link href="/admin/content" className="text-sm text-primary-700 hover:underline">← {t('back')}</Link>}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge status={d.status} /><span className="text-muted">v{d.version_no} · {d.slug}</span>
        {editable && <span aria-live="polite" className="text-muted">{state === 'saving' ? t('saving') : state === 'saved' ? t('savedAuto') : dirty ? t('unsaved') : ''}</span>}
      </div>
      {!editable && (
        <p role="note" className="rounded-lg bg-warning-050 px-4 py-3 text-sm text-warning">
          {t('readOnly', { status: t('status', { status: d.status }) })}{' '}
          {d.type !== 'glossary' ? <button type="button" onClick={() => void revise(d.id)} className="font-semibold underline">{t('revise')}</button> : t('glossaryNoRevision')}
        </p>
      )}
      {state === 'stale' && <p role="alert" className={errorClass}>{t('stale')} <button type="button" className="font-semibold underline" onClick={onReload}>{t('reload')}</button></p>}
      {state === 'error' && <p role="alert" className={errorClass}>{t('saveFailed')}</p>}
      <p className="rounded-lg bg-surface-2 px-4 py-2 text-sm text-muted">{t('sourceRule')}</p>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-3">
          {glossary ? (
            <>
              <label className="flex flex-col gap-1 text-sm font-medium">{t('termTh')}<input value={f.term_th ?? ''} disabled={!editable} onChange={(e) => change({ term_th: e.target.value, title: e.target.value })} className={inputClass} /></label>
              <label className="flex flex-col gap-1 text-sm font-medium">{t('termEn')}<input value={f.term_en ?? ''} disabled={!editable} onChange={(e) => change({ term_en: e.target.value })} className={inputClass} /></label>
              <label className="flex flex-col gap-1 text-sm font-medium">{t('aliases')}<input value={(f.aliases ?? []).join(', ')} disabled={!editable} onChange={(e) => change({ aliases: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} className={inputClass} /></label>
              <label className="flex flex-col gap-1 text-sm font-medium">{t('shortDef')} <span className="font-normal text-muted">({(f.short_def ?? '').length}/160)</span><textarea value={f.short_def ?? ''} maxLength={160} rows={2} disabled={!editable} onChange={(e) => change({ short_def: e.target.value })} className="rounded-lg border border-border-strong bg-surface p-2 font-normal" /></label>
              <label className="flex flex-col gap-1 text-sm font-medium">{t('longDef')}<textarea value={f.long_def_md ?? ''} rows={8} disabled={!editable} onChange={(e) => change({ long_def_md: e.target.value })} className="rounded-lg border border-border-strong bg-surface p-2 font-normal" /></label>
            </>
          ) : (
            <>
              <label className="flex flex-col gap-1 text-sm font-medium">{t('titleField')}<input value={f.title} maxLength={200} disabled={!editable} onChange={(e) => change({ title: e.target.value })} className={inputClass} /></label>
              {d.type !== 'template' && <label className="flex flex-col gap-1 text-sm font-medium">{t('summary')} <span className="font-normal text-muted">({(f.summary ?? '').length}/300)</span><textarea value={f.summary ?? ''} maxLength={300} rows={2} disabled={!editable} onChange={(e) => change({ summary: e.target.value })} className="rounded-lg border border-border-strong bg-surface p-2 font-normal" /></label>}
              {editable && (
                <div className="relative">
                  <label className="flex flex-col gap-1 text-sm font-medium">{t('cite')}<input value={cite} onChange={(e) => setCite(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape' && hits.length > 0) { e.preventDefault(); setCite(''); setHits([]); } }} placeholder="ปพพ 383" className={`${inputClass} max-w-xs`} /></label>
                  {hits.length > 0 && (
                    <ul role="listbox" aria-label={t('cite')} className="absolute z-20 mt-1 w-72 rounded-[10px] border border-border bg-surface p-1 shadow-lg">
                      {hits.map((s) => <li key={`${s.law_code}:${s.section_no}`}><button type="button" role="option" aria-selected="false" onClick={() => insertRef(s)} className="w-full rounded-lg px-2.5 py-2 text-left text-sm hover:bg-surface-2">{s.short} มาตรา {s.section_no} <span className="font-mono text-xs text-muted">[[law:{s.law_code}:{s.section_no}]]</span></button></li>)}
                    </ul>
                  )}
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm font-medium">{t('body')}
                  <textarea ref={bodyRef} value={f.body ?? ''} disabled={!editable} onChange={(e) => change({ body: e.target.value })} rows={26} spellCheck={false} className="min-h-[24rem] rounded-lg border border-border-strong bg-surface p-3 font-mono text-[0.8125rem] leading-relaxed font-normal" />
                </label>
                <div className="flex flex-col gap-1 text-sm font-medium">{t('preview')}
                  <div className="min-h-[24rem] overflow-y-auto rounded-lg border border-border bg-surface p-3 font-normal"><Markdown text={preview} /></div>
                </div>
              </div>
            </>
          )}
          {msg && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? noticeClass : errorClass}>{msg.text}</p>}
          <div className="flex flex-wrap gap-2">
            {editable && <button type="button" className={secondaryBtn} onClick={() => void save()} disabled={!dirty}>{t('saveNow')}</button>}
            {editable && <button type="button" className={primaryBtn} onClick={() => void submit()}>{t('submit')}</button>}
            {d.status === 'in_review' && <Link href={`/admin/review/${d.type}/${d.id}`} className={secondaryBtn}>{t('openReview')}</Link>}
          </div>
        </div>

        <aside className="flex flex-col gap-4">
          <section aria-label={t('precheck')} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 text-sm">
            <h2 className="font-bold">{t('precheck')} {warnings > 0 ? <span className="text-warning">({warnings})</span> : <span className="text-success">✓</span>}</h2>
            <p className="text-xs text-muted">{t('precheckHint')}</p>
            {pre.unknown_law_refs.length > 0 && <p className="text-danger">{t('unknownLaw')}: {pre.unknown_law_refs.join(', ')}</p>}
            {pre.unknown_other_refs.length > 0 && <p className="text-danger">{t('unknownOther')}: {pre.unknown_other_refs.join(', ')}</p>}
            {pre.guarantees.length > 0 && <p className="text-danger">{t('guarantees')}: {pre.guarantees.join(', ')}</p>}
            {!glossary && !pre.has_lawyer_section && <p className="text-warning">{t('noLawyer')}</p>}
            {pre.numbers_to_verify.length > 0 && <p className="text-warning">{t('numbers')}: {pre.numbers_to_verify.join(' · ')}</p>}
            <p className="text-xs text-muted">{t('refCount', { n: pre.law_ref_count })}</p>
          </section>
          {d.versions.length > 0 && (
            <section aria-label={t('versions')} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 text-sm">
              <h2 className="font-bold">{t('versions')}</h2>
              <ul className="flex flex-col gap-1">
                {d.versions.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/content/${d.type}/${v.id}`} className={v.id === d.id ? 'font-bold' : 'text-primary-700 hover:underline'}>v{v.version_no}</Link>
                    <StatusBadge status={v.status} />
                    {v.id !== d.id && <button type="button" onClick={() => setDiffWith(diffWith === v.id ? null : v.id)} className="text-xs text-primary-700 underline">{t('diff')}</button>}
                    {v.id !== d.id && v.status !== 'draft' && <button type="button" onClick={() => void revise(v.id)} className="text-xs text-muted underline">{t('restore')}</button>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      {diffTarget && (
        <section aria-label={t('diffTitle', { n: diffTarget.version_no })} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3">
          <h2 className="font-bold">{t('diffTitle', { n: diffTarget.version_no })}</h2>
          <pre className="max-h-96 overflow-auto rounded-lg bg-bg p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {diffLines(diffTarget.body, f.body ?? '').map((part, i) => (
              <span key={i} className={part.added ? 'bg-success-050 text-success' : part.removed ? 'bg-danger-050 text-danger line-through' : 'text-muted'}>{part.value}</span>
            ))}
          </pre>
        </section>
      )}
    </AdminPage>
  );
}
