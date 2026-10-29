'use client';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, MessageSquare, Printer, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Markdown } from '@/components/chat/Markdown';
import type { GlossaryEntry } from '@/lib/glossary-rehype';
import { apiFetch } from '@/lib/client/api';
import { useLocalString, writeLocal } from '@/lib/client/local-store';

// Segments arrive with [[…]] references already expanded to links (KbMarkdown does that on the server).
export type GuideBodySegment =
  | { type: 'md'; md: string }
  | { type: 'docs'; items: { key: string; md: string }[] }
  | { type: 'steps'; items: { key: string; md: string; ask: string }[] };

type Progress = { checked: string[]; completed: boolean };
const storageKey = (slug: string) => `lc.guide.${slug}`;
const noopSubscribe = () => () => {};
const printDate = () => new Date().toLocaleDateString('th-TH-u-ca-buddhist', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' });

/** A guide with tick-able document list and steps. Members' progress is saved on the server, guests' in this browser. */
export function GuideBody({
  slug,
  segments,
  initial,
  glossary,
}: {
  slug: string;
  segments: GuideBodySegment[];
  initial: Progress | null; // null = guest
  glossary: GlossaryEntry[];
}) {
  const t = useTranslations('guide');
  const member = initial !== null;
  const [memberState, setMemberState] = useState<Progress>(initial ?? { checked: [], completed: false });
  const stored = useLocalString(storageKey(slug));
  const guestState = useMemo<Progress>(() => {
    try {
      const saved = stored ? (JSON.parse(stored) as Progress) : null;
      if (saved && Array.isArray(saved.checked)) return { checked: saved.checked.filter((k) => typeof k === 'string'), completed: !!saved.completed };
    } catch { /* corrupt entry: start empty */ }
    return { checked: [], completed: false };
  }, [stored]);
  const state = member ? memberState : guestState;
  const loaded = member || stored !== undefined;
  // the printed page carries its address and the day it was printed, also when the browser's own print command is used
  const printedAt = useSyncExternalStore(noopSubscribe, printDate, () => '');

  const save = useMutation({
    mutationFn: (p: Progress) => apiFetch(`/api/v1/guides/${slug}/progress`, { method: 'PUT', body: JSON.stringify(p) }),
  });
  const saveRef = useRef(save.mutate);
  useEffect(() => { saveRef.current = save.mutate; });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const update = useCallback((next: Progress) => {
    if (member) {
      setMemberState(next);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => saveRef.current(next), 400);
    } else {
      writeLocal(storageKey(slug), JSON.stringify(next));
    }
  }, [member, slug]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const total = segments.reduce((n, s) => n + (s.type === 'md' ? 0 : s.items.length), 0);
  const done = state.checked.length;
  const toggle = (key: string) =>
    update({ ...state, completed: false, checked: state.checked.includes(key) ? state.checked.filter((k) => k !== key) : [...state.checked, key] });

  return (
    <div className="flex flex-col gap-3">
      {total > 0 && (
        <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-surface/95 px-3 py-2.5 backdrop-blur print:static print:border-0 print:p-0">
          <div className="flex min-w-40 flex-1 flex-col gap-1">
            <span className="text-sm font-semibold" aria-live="polite">
              {loaded ? t('progress', { done, total }) : t('progressLoading')}
            </span>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" role="presentation">
              <div className="h-full bg-primary transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            <button type="button" onClick={() => update({ checked: state.checked, completed: !state.completed })} aria-pressed={state.completed}
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold ${state.completed ? 'bg-success-050 text-success' : 'bg-primary text-white hover:bg-primary-600'}`}>
              <CheckCircle2 className="size-4" aria-hidden="true" />{state.completed ? t('completed') : t('markDone')}
            </button>
            <button type="button" onClick={() => update({ checked: [], completed: false })} disabled={!done && !state.completed}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-surface-2 disabled:opacity-50">
              <RotateCcw className="size-4" aria-hidden="true" />{t('restart')}
            </button>
            <button type="button" onClick={() => window.print()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-surface-2">
              <Printer className="size-4" aria-hidden="true" />{t('print')}
            </button>
          </div>
        </div>
      )}
      {!member && total > 0 && loaded && <p className="text-xs text-muted print:hidden">{t('guestNote')}</p>}
      {save.isError && <p role="alert" className="text-sm text-danger">{t('saveFailed')}</p>}

      {segments.map((seg, i) => {
        if (seg.type === 'md') return <Markdown key={i} text={seg.md} glossary={glossary} />;
        const isSteps = seg.type === 'steps';
        return (
          <ul key={i} className={`flex flex-col ${isSteps ? 'gap-2.5' : 'gap-1.5'}`}>
            {seg.items.map((item, n) => {
              const checked = state.checked.includes(item.key);
              const id = `${slug}-${item.key}`;
              return (
                <li key={item.key} className={`flex gap-3 rounded-xl border p-3 ${checked ? 'border-success/30 bg-success-050/40' : 'border-border bg-surface'}`}>
                  <input id={id} type="checkbox" checked={checked} onChange={() => toggle(item.key)} className="mt-1 size-5 shrink-0 accent-[var(--primary)]" />
                  <div className="min-w-0 flex-1">
                    <label htmlFor={id} className="flex cursor-pointer gap-2">
                      {isSteps && <span className="font-serif font-bold text-primary-700">{n + 1}.</span>}
                      <span className="min-w-0 flex-1 [&_p]:my-0"><Markdown text={item.md} glossary={glossary} /></span>
                    </label>
                    {'ask' in item && (
                      <Link href={`/chat?q=${encodeURIComponent(item.ask)}`} className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:underline print:hidden">
                        <MessageSquare className="size-3.5" aria-hidden="true" />{t('askStep')}
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        );
      })}
      {printedAt && (
        <p className="hidden text-xs text-muted print:block">{t('printFooter', { date: printedAt, url: typeof window === 'undefined' ? '' : window.location.href })}</p>
      )}
    </div>
  );
}
