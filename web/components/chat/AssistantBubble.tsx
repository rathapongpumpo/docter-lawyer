'use client';
import { AlertTriangle, BookOpen, Bookmark, BookmarkCheck, Check, ChevronLeft, ChevronRight, Copy, CornerDownRight, FileText, ListChecks, RotateCcw, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { LogoMark } from '@/components/brand/Logo';
import { useShell } from '@/components/shell/shell-context';
import { apiFetch } from '@/lib/client/api';
import { patchMessage, type UiMessage } from '@/lib/client/chat-store';
import type { Citation, NextStep } from '@/lib/sse';
import { FeedbackButtons } from './FeedbackButtons';
import { useGlossaryTips } from '@/lib/client/glossary';
import { Markdown } from './Markdown';

const STEP_URL: Partial<Record<NextStep['type'], string>> = { guide: '/guides/', template: '/templates/', article: '/library/articles/' };

export function AssistantBubble({ m, isLast, slotKey, chatTitle, owner, busy, onCitation, onSend, onRegenerate }: {
  m: UiMessage; isLast: boolean; slotKey: string; chatTitle: string; owner: boolean; busy: boolean;
  onCitation: (n: number, citations: Citation[]) => void; onSend: (text: string) => void; onRegenerate: () => void;
}) {
  const t = useTranslations('chat');
  const { user } = useShell();
  const glossary = useGlossaryTips();
  const [copied, setCopied] = useState(false);
  const [signUpHint, setSignUpHint] = useState(false);
  const versions = m.versions ?? [];
  const [picked, setPicked] = useState<number | null>(null);
  // the newest version is the live answer; older ones are read-only (FR-CHAT-006)
  const viewIndex = picked !== null && picked < versions.length - 1 ? picked : versions.length - 1;
  const old = versions.length > 1 && viewIndex < versions.length - 1 ? versions[viewIndex] : null;
  const content = old ? old.content : m.content;
  const citations = (old ? old.citations : m.citations) ?? [];
  const status = old ? old.status : m.status;
  const done = status === 'completed' && !!content;
  const live = !old;

  async function copy() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  async function toggleBookmark() {
    if (user.isGuest) return setSignUpHint(true);
    if (!m.id) return;
    const next = !m.bookmarked;
    patchMessage(slotKey, m.key, (x) => ({ ...x, bookmarked: next }));
    try {
      if (next) await apiFetch('/api/v1/bookmarks', { method: 'POST', body: JSON.stringify({ item_type: 'message', item_id: String(m.id), title: (chatTitle || content).slice(0, 120) }) });
      else await apiFetch('/api/v1/bookmarks', { method: 'DELETE', body: JSON.stringify({ item_type: 'message', item_id: String(m.id) }) });
    } catch { patchMessage(slotKey, m.key, (x) => ({ ...x, bookmarked: !next })); }
  }

  return (
    <div id={m.id ? `msg-${m.id}` : undefined} className="flex flex-col gap-2 scroll-mt-4">
      <div className="flex items-center gap-2">
        <LogoMark size={26} />
        <span className="text-sm font-semibold">{t('assistant')}</span>
        {m.statusText && <span className="animate-pulse text-xs text-muted">{m.statusText}</span>}
      </div>
      {m.safety && live && (
        <div role="alert" className={`flex gap-2 rounded-xl border p-3 text-sm ${m.safety.level === 'urgent' ? 'border-danger/30 bg-danger-050 text-danger' : 'border-warning/40 bg-warning-050'}`}>
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p>{m.safety.message}</p>
            {m.safety.contacts.map((c) => (
              <span key={c.name} className="font-semibold">
                {c.phone ? <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} className="underline">{c.name} · {c.phone}</a> : c.name}
              </span>
            ))}
          </div>
        </div>
      )}
      {m.guardrail && live ? (
        <div className="flex gap-2 rounded-xl border border-border bg-warning-050 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <div><p className="font-semibold">{m.guardrail.title}</p><p>{m.guardrail.text}</p></div>
        </div>
      ) : (
        <div className="rounded-2xl rounded-tl-sm border border-border bg-surface px-4 py-3">
          {content ? (
            <Markdown text={content} glossary={glossary} onCitation={citations.length ? (n) => onCitation(n, citations) : undefined} citationLabel={(n) => t('citation', { n })} />
          ) : status === 'streaming' ? <span className="text-muted">…</span> : null}
          {status === 'stopped' && <p className="mt-2 text-xs text-muted">{t('stopped')}</p>}
          {status === 'error' && (
            <p className="mt-2 flex flex-wrap items-center gap-3 text-sm text-danger">{t('errorStream')}
              {owner && !busy && <button type="button" onClick={onRegenerate} className="inline-flex items-center gap-1 rounded-lg border border-danger/40 px-2 py-1 text-xs font-semibold hover:bg-danger-050"><RotateCcw className="size-3.5" aria-hidden="true" />{t('retry')}</button>}
            </p>
          )}
        </div>
      )}
      {done && citations.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold text-muted">{t('sources')}</span>
          {citations.map((c) => (
            <button key={c.n} type="button" onClick={() => onCitation(c.n, citations)} className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 text-xs hover:border-primary/50">
              <span className="font-bold text-primary-700">{c.n}</span><span className="truncate">{c.label}</span>
            </button>
          ))}
        </div>
      )}
      {done && live && (m.nextSteps?.length ?? 0) > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted">{t('nextSteps')}</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {m.nextSteps!.filter((s) => STEP_URL[s.type]).map((s) => {
              const Icon = s.type === 'template' ? FileText : s.type === 'article' ? BookOpen : ListChecks;
              return (
                <Link key={`${s.type}:${s.slug}`} href={`${STEP_URL[s.type]}${s.slug}`} className="flex items-start gap-2.5 rounded-xl border border-border bg-surface p-3 hover:border-primary/50">
                  <Icon className="mt-0.5 size-4 shrink-0 text-primary-700" aria-hidden="true" />
                  <span className="flex flex-col"><span className="text-xs text-muted">{t('stepType', { type: s.type })}</span><span className="text-sm leading-snug font-medium">{s.title}</span></span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
      {done && live && isLast && owner && (m.followups?.length ?? 0) > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-muted">{t('followups')}</span>
          <div className="flex flex-wrap gap-2">
            {m.followups!.slice(0, 3).map((f) => (
              <button key={f} type="button" disabled={busy} onClick={() => onSend(f)} className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary-050 px-3 py-1.5 text-left text-[0.8125rem] text-primary-700 hover:border-primary disabled:opacity-50">
                <CornerDownRight className="size-3.5 shrink-0" aria-hidden="true" />{f}
              </button>
            ))}
          </div>
        </div>
      )}
      {done && (
        <div className="flex flex-wrap items-center gap-1 text-muted">
          {versions.length > 1 && (
            <span className="mr-1 flex items-center gap-0.5 text-xs" aria-label={t('versions')}>
              <button type="button" disabled={viewIndex === 0} onClick={() => setPicked(viewIndex - 1)} aria-label={t('prevVersion')} className="flex size-7 items-center justify-center rounded-lg hover:bg-surface-2 disabled:opacity-40"><ChevronLeft className="size-4" aria-hidden="true" /></button>
              <span aria-live="polite">{viewIndex + 1}/{versions.length}</span>
              <button type="button" disabled={viewIndex === versions.length - 1} onClick={() => setPicked(viewIndex + 1)} aria-label={t('nextVersion')} className="flex size-7 items-center justify-center rounded-lg hover:bg-surface-2 disabled:opacity-40"><ChevronRight className="size-4" aria-hidden="true" /></button>
            </span>
          )}
          <button type="button" onClick={() => void copy()} aria-label={copied ? t('copied') : t('copy')} className="flex size-8 items-center justify-center rounded-lg hover:bg-surface-2">
            {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
          </button>
          {owner && live && m.id && (
            <>
              <FeedbackButtons messageId={m.id} value={m.feedback ?? null} onChange={(f) => patchMessage(slotKey, m.key, (x) => ({ ...x, feedback: f }))} />
              <button type="button" onClick={() => void toggleBookmark()} aria-pressed={!!m.bookmarked} aria-label={m.bookmarked ? t('saved') : t('save')} title={m.bookmarked ? t('saved') : t('save')}
                className={`flex size-8 items-center justify-center rounded-lg hover:bg-surface-2 ${m.bookmarked ? 'text-primary-700' : ''}`}>
                {m.bookmarked ? <BookmarkCheck className="size-4" aria-hidden="true" /> : <Bookmark className="size-4" aria-hidden="true" />}
              </button>
            </>
          )}
          {owner && live && isLast && !busy && (
            <button type="button" onClick={onRegenerate} aria-label={t('regenerate')} title={t('regenerate')} className="flex size-8 items-center justify-center rounded-lg hover:bg-surface-2"><RotateCcw className="size-4" aria-hidden="true" /></button>
          )}
        </div>
      )}
      {signUpHint && <p role="status" className="text-sm text-muted">{t('saveNeedsAccount')} <Link href="/register" className="font-semibold text-primary-700 underline">{t('quotaRegister')}</Link></p>}
    </div>
  );
}
