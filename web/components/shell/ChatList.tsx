'use client';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, FolderPlus, Folder as FolderIcon, MoreHorizontal, Pin, Search, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, type ChatSummary } from '@/lib/client/api';
import { dropSlot, useChatStates } from '@/lib/client/chat-store';
import { ConfirmDialog } from './ConfirmDialog';
import { useShell } from './shell-context';

type FolderT = { id: number; name: string; is_collapsed: boolean; chat_count: number };
type Page = { chats: ChatSummary[]; has_more: boolean; folders?: FolderT[] };
const PAGE = 50;

// Sidebar history (FR-CHAT-018–024): pinned first, folders, filter, per-chat menu, state dots for background answers.
export function ChatList({ onNavigate }: { onNavigate: () => void }) {
  const t = useTranslations('nav');
  const tc = useTranslations('chat.history');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const { user } = useShell();
  const states = useChatStates();
  const [filter, setFilter] = useState('');
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState<string | number | null>(null);
  const [renaming, setRenaming] = useState<{ kind: 'chat' | 'folder'; id: string | number } | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: 'chat'; chat: ChatSummary } | { kind: 'folder'; folder: FolderT } | null>(null);
  const activeChatId = pathname.startsWith('/chat/') ? pathname.split('/')[2] : null;
  const wrapRef = useRef<HTMLDivElement>(null);

  // server-side title search once ≥2 characters are typed; shorter input only filters what is loaded (FR-CHAT-019)
  useEffect(() => { const id = setTimeout(() => setQ(filter.trim().length >= 2 ? filter.trim() : ''), 250); return () => clearTimeout(id); }, [filter]);
  const { data, isPending, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['chats', q],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => apiFetch<Page>(`/api/v1/chats?offset=${pageParam}&limit=${PAGE}${q ? `&q=${encodeURIComponent(q)}` : ''}`),
    getNextPageParam: (last, all) => (last.has_more ? all.length * PAGE : undefined),
  });
  const chats = useMemo(() => data?.pages.flatMap((p) => p.chats) ?? [], [data]);
  const folders = data?.pages[0]?.folders ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ['chats'] });

  useEffect(() => {
    if (menu === null) return;
    const close = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === 'Escape' : !wrapRef.current?.contains(e.target as Node)) setMenu(null); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [menu]);

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return f ? chats.filter((c) => c.title.toLowerCase().includes(f)) : chats;
  }, [chats, filter]);
  const filtering = filter.trim().length > 0;
  const pinned = shown.filter((c) => c.is_pinned && !c.folder_id);
  const loose = shown.filter((c) => !c.is_pinned && !c.folder_id);
  const inFolder = (id: number) => shown.filter((c) => c.folder_id === id);

  const relTime = (iso: string) => {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff > 7 * 86400) return new Date(iso).toLocaleDateString(locale === 'th' ? 'th-TH-u-ca-buddhist' : 'en-GB', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'Asia/Bangkok' });
    const rtf = new Intl.RelativeTimeFormat(locale === 'th' ? 'th' : 'en', { numeric: 'auto' });
    if (diff < 60) return rtf.format(0, 'second');
    if (diff < 3600) return rtf.format(-Math.floor(diff / 60), 'minute');
    if (diff < 86400) return rtf.format(-Math.floor(diff / 3600), 'hour');
    return rtf.format(-Math.floor(diff / 86400), 'day');
  };

  async function patchChat(id: string, body: object) { await apiFetch(`/api/v1/chats/${id}`, { method: 'PATCH', body: JSON.stringify(body) }); await refresh(); }
  async function removeChat(c: ChatSummary) {
    await apiFetch(`/api/v1/chats/${c.id}`, { method: 'DELETE' });
    dropSlot(c.id);
    setConfirm(null);
    await refresh();
    if (activeChatId === c.id) router.replace('/chat?new=1'); // deleting the open chat returns to a new one (FR-CHAT-022 AC1)
  }
  async function removeFolder(f: FolderT, mode: 'keep' | 'delete_chats') {
    await apiFetch(`/api/v1/chat-folders/${f.id}`, { method: 'DELETE', body: JSON.stringify({ mode }) });
    setConfirm(null);
    await refresh();
    if (mode === 'delete_chats' && chats.some((c) => c.folder_id === f.id && c.id === activeChatId)) router.replace('/chat?new=1');
  }
  async function createFolder(name: string) {
    setCreating(false);
    if (!name.trim()) return;
    await apiFetch('/api/v1/chat-folders', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
    await refresh();
  }

  function Row({ c }: { c: ChatSummary }) {
    const dot = states[c.id];
    const active = activeChatId === c.id;
    const editing = renaming?.kind === 'chat' && renaming.id === c.id;
    return (
      <li className="group relative">
        {editing ? (
          <form className="px-2 py-1" onSubmit={async (e) => { e.preventDefault(); const v = String(new FormData(e.currentTarget).get('title')).trim(); setRenaming(null); if (v && v !== c.title) await patchChat(c.id, { title: v }); }}>
            <input name="title" defaultValue={c.title} autoFocus maxLength={120} aria-label={tc('rename')} onKeyDown={(e) => e.key === 'Escape' && setRenaming(null)} onBlur={() => setRenaming(null)}
              className="h-8 w-full rounded-md border border-primary bg-surface px-2 text-[0.8125rem] outline-none" />
          </form>
        ) : (
          <Link href={`/chat/${c.id}`} onClick={onNavigate} aria-current={active ? 'page' : undefined} title={c.title}
            className={`flex items-center gap-1.5 rounded-lg py-2 pr-9 pl-3 text-[0.8125rem] ${active ? 'bg-surface-2 font-medium' : 'hover:bg-surface-2'}`}>
            {dot === 'processing' && <span role="img" aria-label={tc('processing')} className="size-2 shrink-0 animate-pulse rounded-full bg-warning" />}
            {dot === 'ready' && <span role="img" aria-label={tc('ready')} className="size-2 shrink-0 rounded-full bg-success" />}
            {c.is_pinned && <Pin className="size-3 shrink-0 text-primary-700" aria-label={t('pinned')} />}
            {c.visibility === 'org' && <Users className="size-3 shrink-0 text-muted" aria-label={t('sharedChat')} />}
            {c.is_shared && <span className="shrink-0 rounded bg-primary-050 px-1 text-[0.6875rem] text-primary-700">{tc('shared')}</span>}
            <span className="truncate">{c.title || t('newChat')}</span>
            <span className="ml-auto shrink-0 truncate text-xs text-muted">{c.owner_name ?? relTime(c.updated_at)}</span>
          </Link>
        )}
        {c.mine && !editing && (
          <>
            <button type="button" aria-label={tc('menu', { title: c.title })} aria-haspopup="menu" aria-expanded={menu === c.id} onClick={() => setMenu(menu === c.id ? null : c.id)}
              className="absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-border focus:opacity-100 aria-expanded:opacity-100">
              <MoreHorizontal className="size-4" aria-hidden="true" />
            </button>
            {menu === c.id && (
              <div role="menu" className="absolute top-full right-1 z-40 mt-1 w-52 rounded-[10px] border border-border bg-surface p-1 text-[0.8125rem] shadow-lg">
                <button role="menuitem" className="w-full rounded-lg px-2.5 py-2 text-left hover:bg-surface-2" onClick={() => { setMenu(null); setRenaming({ kind: 'chat', id: c.id }); }}>{tc('rename')}</button>
                <button role="menuitem" className="w-full rounded-lg px-2.5 py-2 text-left hover:bg-surface-2" onClick={async () => { setMenu(null); await patchChat(c.id, { is_pinned: !c.is_pinned }); }}>{c.is_pinned ? tc('unpin') : tc('pin')}</button>
                {!user.isGuest && folders.length > 0 && (
                  <>
                    <div className="px-2.5 pt-1.5 pb-0.5 text-xs text-muted">{tc('moveTo')}</div>
                    {c.folder_id && <button role="menuitem" className="w-full rounded-lg px-2.5 py-1.5 text-left hover:bg-surface-2" onClick={async () => { setMenu(null); await patchChat(c.id, { folder_id: null }); }}>{tc('noFolder')}</button>}
                    {folders.filter((f) => f.id !== c.folder_id).map((f) => (
                      <button key={f.id} role="menuitem" className="w-full truncate rounded-lg px-2.5 py-1.5 text-left hover:bg-surface-2" onClick={async () => { setMenu(null); await patchChat(c.id, { folder_id: f.id }); }}>{f.name}</button>
                    ))}
                  </>
                )}
                <div className="my-1 border-t border-border" />
                <button role="menuitem" className="w-full rounded-lg px-2.5 py-2 text-left text-danger hover:bg-danger-050" onClick={() => { setMenu(null); setConfirm({ kind: 'chat', chat: c }); }}>{tc('delete')}</button>
              </div>
            )}
          </>
        )}
      </li>
    );
  }

  const folderVisible = (f: FolderT) => !filtering || inFolder(f.id).length > 0;
  return (
    <div ref={wrapRef} className="flex min-h-72 flex-1 flex-col gap-2 px-4 pt-2.5">
      <div className="flex items-center justify-between px-3">
        <span className="text-xs font-semibold tracking-wide text-muted">{t('recentChats')}</span>
        {!user.isGuest && <button type="button" onClick={() => setCreating(true)} aria-label={tc('newFolder')} title={tc('newFolder')} className="flex size-6 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-text"><FolderPlus className="size-4" aria-hidden="true" /></button>}
      </div>
      <label className="flex h-9 items-center gap-2 rounded-lg border border-border bg-bg px-2.5 text-muted">
        <Search className="size-[15px]" aria-hidden="true" />
        <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={t('filterChats')} placeholder={t('filterChats')} className="w-full bg-transparent text-[0.8125rem] text-text outline-none" />
      </label>
      {creating && (
        <form onSubmit={(e) => { e.preventDefault(); void createFolder(String(new FormData(e.currentTarget).get('name'))); }} className="px-1">
          <input name="name" autoFocus maxLength={80} aria-label={tc('folderName')} placeholder={tc('folderName')} onBlur={() => setCreating(false)} onKeyDown={(e) => e.key === 'Escape' && setCreating(false)} className="h-8 w-full rounded-md border border-primary bg-surface px-2 text-[0.8125rem] outline-none" />
        </form>
      )}
      <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pb-3">
        {isPending && [0, 1, 2].map((i) => <li key={i} aria-hidden="true" className="mx-3 my-2 h-4 animate-pulse rounded bg-surface-2" />)}
        {!isPending && shown.length === 0 && (filtering || folders.length === 0) && <li className="px-3 py-2 text-[0.8125rem] text-muted">{filtering ? tc('noMatch') : t('noChats')}</li>}
        {pinned.length > 0 && <li className="px-3 pt-1 pb-0.5 text-xs text-muted">{tc('pinnedGroup')}</li>}
        {pinned.map((c) => <Row key={c.id} c={c} />)}
        {pinned.length > 0 && (loose.length > 0 || folders.length > 0) && <li aria-hidden="true" className="mx-3 my-1 border-t border-border" />}
        {folders.filter(folderVisible).map((f) => {
          const open = filtering || !f.is_collapsed;
          const editing = renaming?.kind === 'folder' && renaming.id === f.id;
          return (
            <li key={`f${f.id}`} className="group/f relative">
              {editing ? (
                <form className="px-2 py-1" onSubmit={async (e) => { e.preventDefault(); const v = String(new FormData(e.currentTarget).get('name')).trim(); setRenaming(null); if (v) { await apiFetch(`/api/v1/chat-folders/${f.id}`, { method: 'PATCH', body: JSON.stringify({ name: v }) }); await refresh(); } }}>
                  <input name="name" defaultValue={f.name} autoFocus maxLength={80} aria-label={tc('folderName')} onBlur={() => setRenaming(null)} onKeyDown={(e) => e.key === 'Escape' && setRenaming(null)} className="h-8 w-full rounded-md border border-primary bg-surface px-2 text-[0.8125rem] outline-none" />
                </form>
              ) : (
                <div className="flex items-center rounded-lg pr-1 hover:bg-surface-2">
                  <button type="button" aria-expanded={open} onClick={async () => { await apiFetch(`/api/v1/chat-folders/${f.id}`, { method: 'PATCH', body: JSON.stringify({ is_collapsed: open }) }); await refresh(); }}
                    className="flex min-w-0 flex-1 items-center gap-1.5 py-2 pl-2 text-left text-[0.8125rem] font-medium">
                    {open ? <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" /> : <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />}
                    <FolderIcon className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
                    <span className="truncate">{f.name}</span><span className="text-xs text-muted">{f.chat_count}</span>
                  </button>
                  <button type="button" aria-label={tc('folderMenu', { name: f.name })} aria-haspopup="menu" aria-expanded={menu === `f${f.id}`} onClick={() => setMenu(menu === `f${f.id}` ? null : `f${f.id}`)} className="flex size-7 items-center justify-center rounded-md text-muted opacity-0 group-hover/f:opacity-100 hover:bg-border focus:opacity-100 aria-expanded:opacity-100"><MoreHorizontal className="size-4" aria-hidden="true" /></button>
                </div>
              )}
              {menu === `f${f.id}` && (
                <div role="menu" className="absolute top-full right-1 z-40 mt-1 w-44 rounded-[10px] border border-border bg-surface p-1 text-[0.8125rem] shadow-lg">
                  <button role="menuitem" className="w-full rounded-lg px-2.5 py-2 text-left hover:bg-surface-2" onClick={() => { setMenu(null); setRenaming({ kind: 'folder', id: f.id }); }}>{tc('rename')}</button>
                  <button role="menuitem" className="w-full rounded-lg px-2.5 py-2 text-left text-danger hover:bg-danger-050" onClick={() => { setMenu(null); setConfirm({ kind: 'folder', folder: f }); }}>{tc('deleteFolder')}</button>
                </div>
              )}
              {open && <ul className="ml-3 border-l border-border">{inFolder(f.id).map((c) => <Row key={c.id} c={c} />)}</ul>}
            </li>
          );
        })}
        {loose.map((c) => <Row key={c.id} c={c} />)}
        {hasNextPage && !filtering && <li><button type="button" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()} className="w-full rounded-lg px-3 py-2 text-left text-[0.8125rem] text-primary-700 hover:bg-surface-2">{tc('more')}</button></li>}
      </ul>
      {confirm?.kind === 'chat' && (
        <ConfirmDialog title={tc('deleteTitle')} confirmLabel={tc('delete')} onCancel={() => setConfirm(null)} onConfirm={() => void removeChat(confirm.chat)}>
          {tc('deleteText', { title: confirm.chat.title || t('newChat') })}
        </ConfirmDialog>
      )}
      {confirm?.kind === 'folder' && (
        <ConfirmDialog title={tc('deleteFolderTitle', { name: confirm.folder.name })} confirmLabel={tc('deleteFolderChats')} onCancel={() => setConfirm(null)} onConfirm={() => void removeFolder(confirm.folder, 'delete_chats')}
          extra={<button type="button" onClick={() => void removeFolder(confirm.folder, 'keep')} className="h-10 rounded-[10px] border border-border-strong px-4 text-sm font-medium hover:bg-surface-2">{tc('deleteFolderKeep')}</button>}>
          {tc('deleteFolderText', { n: confirm.folder.chat_count })}
        </ConfirmDialog>
      )}
    </div>
  );
}
