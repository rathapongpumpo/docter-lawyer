'use client';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, FileSearch, FileX, Landmark, PackageX, Square, Timer } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useShell } from '@/components/shell/shell-context';
import { apiFetch } from '@/lib/client/api';
import { detachNewChat, loadChat, patchMeta, sendMessage, setViewing, stopStream, useChatSlot, type UiMessage } from '@/lib/client/chat-store';
import type { Citation } from '@/lib/sse';
import { AssistantBubble } from './AssistantBubble';
import { ChatTopBar } from './ChatTopBar';
import { ScopePanel, type CategoryOption } from './ScopePanel';
import { SourcePanel } from './SourcePanel';

const MAX_CHARS = 4000;
export const DRAFT_KEY = 'lc_chat_draft';

const CHAT_PATH = /^\/chat\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function ChatView({ chatId: routeChatId, initialDraft = '', categories = [], notFound = false }: {
  chatId: string | null; initialDraft?: string; categories?: CategoryOption[]; notFound?: boolean;
}) {
  const t = useTranslations('chat');
  const locale = useLocale();
  const { user } = useShell();
  // A new chat's URL becomes /chat/<id> through history.replaceState, so after "back" from another page the router can
  // hand us the cached empty /chat render (routeChatId = null) while the address bar says /chat/<id>: trust the URL too.
  const pathname = usePathname();
  const chatId = routeChatId ?? CHAT_PATH.exec(pathname)?.[1] ?? null;
  const [draft, setDraft] = useState(initialDraft);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [sources, setSources] = useState<{ citations: Citation[]; n: number } | null>(null);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [pendingScope, setPendingScope] = useState<string[]>([]);
  const [atBottom, setAtBottom] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);

  // the slot holding this chat's messages: the real id once it exists (a new chat starts in the slot 'new')
  const slotKey = chatId ?? createdId ?? 'new';
  const slot = useChatSlot(slotKey);
  const { messages, streaming, meta } = slot;

  // Unsent text survives a session timeout (kept per tab, cleared on send and on sign-out).
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(DRAFT_KEY);
      if (saved && !initialDraft) {
        const id = setTimeout(() => setDraft(saved), 0);
        return () => clearTimeout(id);
      }
    } catch { /* storage may be blocked */ }
  }, [initialDraft]);
  useEffect(() => {
    try {
      if (draft) sessionStorage.setItem(DRAFT_KEY, draft);
      else sessionStorage.removeItem(DRAFT_KEY);
    } catch { /* storage may be blocked */ }
  }, [draft]);

  useEffect(() => {
    setViewing(slotKey);
    return () => { setViewing(null); if (slotKey === 'new') detachNewChat(); }; // leaving while the first answer is still coming keeps it running
  }, [slotKey]);
  useEffect(() => { if (chatId) void loadChat(chatId); }, [chatId]);

  // remember the last chat so /chat reopens it (FR-CHAT-030)
  useEffect(() => {
    if (!chatId || user.isGuest || meta?.access !== 'owner') return;
    void apiFetch('/api/v1/me/settings', { method: 'PATCH', body: JSON.stringify({ last_chat_id: chatId }) }).catch(() => undefined);
  }, [chatId, user.isGuest, meta?.access]);

  // "N messages left today" once 3 or fewer remain (FR-AUTH-007 AC2); re-read after every answer
  const { data: quota, refetch: refetchQuota } = useQuery({ queryKey: ['quota'], queryFn: () => apiFetch<{ messages_left: number }>('/api/v1/session'), staleTime: 60_000 });
  const wasStreaming = useRef(false);
  useEffect(() => {
    if (wasStreaming.current && !streaming) void refetchQuota();
    wasStreaming.current = streaming;
  }, [streaming, refetchQuota]);

  // follow the answer while streaming unless the reader scrolled up; offer a jump button when far from the end (FR-CHAT-029)
  const onScroll = useCallback(() => {
    const el = logRef.current;
    if (!el) return;
    const far = el.scrollHeight - el.scrollTop - el.clientHeight;
    followRef.current = far < 80;
    setAtBottom(far < 200);
  }, []);
  useEffect(() => {
    if (followRef.current) bottomRef.current?.scrollIntoView({ block: 'end' }); // block body on purpose: scrollIntoView may return a Promise
  }, [messages]);
  // deep link from "Saved": /chat/<id>#msg-<messageId> scrolls to the answer and highlights it for 2 seconds
  const highlighted = useRef(false);
  useEffect(() => {
    if (highlighted.current || !messages.length) return;
    const hash = window.location.hash;
    if (!/^#msg-\d+$/.test(hash)) return;
    const el = document.getElementById(hash.slice(1));
    if (!el) return;
    highlighted.current = true;
    followRef.current = false;
    el.scrollIntoView({ block: 'center' });
    el.classList.add('ring-2', 'ring-primary', 'rounded-2xl');
    setTimeout(() => el.classList.remove('ring-2', 'ring-primary', 'rounded-2xl'), 2000);
  }, [messages]);

  const scope = meta ? meta.chat.scope : pendingScope;
  async function changeScope(next: string[]) {
    if (meta) {
      patchMeta(slotKey, (c) => ({ ...c, scope: next }));
      await apiFetch(`/api/v1/chats/${slotKey}`, { method: 'PATCH', body: JSON.stringify({ scope: next }) }).catch(() => undefined);
    } else setPendingScope(next);
  }

  const ownerCanWrite = !meta || meta.access === 'owner';
  function send(text: string, regenerate = false) {
    followRef.current = true;
    void sendMessage(slotKey, text, {
      locale, regenerate,
      scope: scope.length ? scope : 'auto',
      onCreated: (id) => { window.history.replaceState(null, '', `/chat/${id}`); setCreatedId(id); },
    });
  }
  function regenerate() {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUser) send(lastUser.content, !!(meta || chatId || createdId));
  }
  function submit(e?: FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || streaming || text.length > MAX_CHARS) return;
    setDraft('');
    send(text);
  }
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
    if (e.key === 'Escape' && streaming) stopStream(slotKey);
  }

  // one example per problem the Phase-1 knowledge base covers: late-delivery penalty, defective supply, termination, contract review
  const examples = [
    { text: t('example1'), Icon: Timer }, { text: t('example2'), Icon: PackageX }, { text: t('example3'), Icon: FileX }, { text: t('example4'), Icon: FileSearch },
  ];
  const empty = messages.length === 0;
  const readOnly = !!meta && meta.access !== 'owner';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {meta && (chatId || createdId) && <ChatTopBar chatId={(chatId ?? createdId)!} meta={meta} />}
      {notFound && <p role="alert" className="border-b border-border bg-warning-050 px-4 py-2 text-sm text-warning">{t('chatNotFound')}</p>}
      <div className="relative min-h-0 flex-1">
        <div ref={logRef} onScroll={onScroll} className="h-full overflow-y-auto" role="log" aria-live="polite">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6">
            {empty && !slot.loaded && chatId && <p className="text-muted">…</p>}
            {empty && (slot.loaded || !chatId) && (
              <section className="flex flex-col gap-6 pt-6">
                <div className="flex flex-col gap-2">
                  <h1 className="font-serif text-3xl leading-snug font-bold text-navy sm:text-4xl dark:text-text">
                    {t('greeting', { name: user.isGuest || !user.name ? 'empty' : user.name })}<br />
                    <span className="text-gold-text">{t('greetingQuestion')}</span>
                  </h1>
                  <p className="text-muted">{t('greetingSub')}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-[0.8125rem] font-semibold text-muted">{t('examplesTitle')}</span>
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {examples.map(({ text, Icon }) => (
                      <li key={text}>
                        <button type="button" onClick={() => send(text)} className="flex h-full w-full items-start gap-3 rounded-2xl border border-border bg-surface px-4 py-4 text-left text-[0.9375rem] leading-snug shadow-[0_6px_18px_-12px_rgba(14,42,76,0.35)] transition-shadow hover:border-gold hover:shadow-md">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-050"><Icon className="size-[18px] text-primary-700" aria-hidden="true" /></span>
                          <span className="pt-1.5">{text}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            )}
            {messages.map((m, i) =>
              m.role === 'user' ? (
                <UserBubble key={m.key} text={m.content} />
              ) : (
                <AssistantBubble key={m.key} m={m} isLast={i === messages.length - 1} slotKey={slotKey} chatTitle={meta?.chat.title ?? ''} owner={ownerCanWrite && !readOnly} busy={streaming}
                  onCitation={(n, cites) => setSources({ citations: cites, n })} onSend={(text) => !streaming && send(text)} onRegenerate={regenerate} />
              ),
            )}
            <div ref={bottomRef} />
          </div>
        </div>
        {!atBottom && (
          <button type="button" onClick={() => { followRef.current = true; bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }} aria-label={t('scrollDown')}
            className="absolute bottom-3 left-1/2 flex size-10 -translate-x-1/2 items-center justify-center rounded-full border border-border-strong bg-surface shadow-md hover:bg-surface-2">
            <ArrowDown className="size-5" aria-hidden="true" />
          </button>
        )}
      </div>

      {readOnly ? (
        <p role="note" className="mx-auto mb-3 w-full max-w-3xl px-4 text-sm text-muted sm:px-6">{t('readOnly')}</p>
      ) : (
        <form onSubmit={submit} className="mx-auto w-full max-w-3xl px-4 pb-3 sm:px-6">
          {quota && quota.messages_left <= 3 && (
            <p role="status" className="mb-2 flex flex-wrap items-center gap-x-3 rounded-lg bg-warning-050 px-3 py-2 text-sm text-warning">
              {t('quotaLow', { n: quota.messages_left })}
              {user.isGuest && <Link href="/register" className="font-semibold underline">{t('quotaRegister')}</Link>}
            </p>
          )}
          {slot.notice === 'busy' && <p role="alert" className="mb-2 rounded-lg bg-warning-050 px-3 py-2 text-sm text-warning">{t('tooManyStreams')}</p>}
          {categories.length > 0 && scopeOpen && <ScopePanel categories={categories} value={scope} onChange={(v) => void changeScope(v)} />}
          <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
            {categories.length > 0 && (
              <button type="button" onClick={() => setScopeOpen((v) => !v)} aria-expanded={scopeOpen} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-muted hover:text-text">
                <Landmark className="size-3.5" aria-hidden="true" />{t('scope.label')}: {scope.length ? t('scope.count', { n: scope.length }) : t('scope.auto')}
              </button>
            )}
          </div>
          <div className="flex items-end gap-2 rounded-2xl border border-border bg-surface p-2 pl-4 shadow-[0_10px_30px_-14px_rgba(14,42,76,0.4)] focus-within:border-primary">
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} rows={1} aria-label={t('placeholder')} placeholder={t('placeholder')}
              className="max-h-48 min-h-[44px] flex-1 resize-none bg-transparent py-2.5 text-[0.9375rem] leading-relaxed [field-sizing:content] outline-none" />
            {draft.length > MAX_CHARS * 0.9 && (
              <span className={`self-center text-xs ${draft.length > MAX_CHARS ? 'text-danger' : 'text-muted'}`}>{t('charCount', { count: draft.length, max: MAX_CHARS })}</span>
            )}
            {streaming ? (
              <button type="button" onClick={() => stopStream(slotKey)} aria-label={t('stop')} className="flex size-11 items-center justify-center rounded-xl bg-text text-surface"><Square className="size-4" fill="currentColor" aria-hidden="true" /></button>
            ) : (
              <button type="submit" aria-label={t('send')} disabled={!draft.trim() || draft.length > MAX_CHARS} className="flex size-11 items-center justify-center rounded-xl bg-primary text-white shadow-sm hover:bg-primary-600 disabled:opacity-40"><ArrowUp className="size-5" aria-hidden="true" /></button>
            )}
          </div>
        </form>
      )}
      {sources && <SourcePanel citations={sources.citations} active={sources.n} onClose={() => setSources(null)} />}
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return <div className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-primary-050 px-4 py-3 text-[0.9375rem] leading-relaxed whitespace-pre-wrap">{text}</div>;
}
export type { UiMessage };
