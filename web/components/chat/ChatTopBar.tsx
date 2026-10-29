'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Lock, Printer, Send, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { errorClass, noticeClass, primaryBtn, secondaryBtn } from '@/components/account/styles';
import { useShell } from '@/components/shell/shell-context';
import { apiFetch } from '@/lib/client/api';
import { patchMeta, type ChatMeta } from '@/lib/client/chat-store';
import { ShareDialog } from './ShareDialog';

type OrgInfo = { counsel: { user_id: number; name: string }[] };

// Above the messages of a stored chat: who can read it (organization chats), send-to-counsel, public link (personal chats), print.
export function ChatTopBar({ chatId, meta }: { chatId: string; meta: ChatMeta }) {
  const t = useTranslations('org.chatBar');
  const tc = useTranslations('chat');
  const { user } = useShell();
  const qc = useQueryClient();
  const orgId = meta.chat.org_id;
  const { data: org } = useQuery({ queryKey: ['org', orgId], enabled: !!orgId && meta.access === 'owner', queryFn: () => apiFetch<OrgInfo>(`/api/v1/orgs/${orgId}`) });
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (meta.access !== 'owner') {
    return <div role="note" className="flex items-center gap-2 border-b border-border bg-surface-2 px-4 py-2 text-sm"><Users className="size-4" aria-hidden="true" />{meta.access === 'counsel' ? t('sentToYou', { name: meta.owner_name ?? '' }) : t('sharedBy', { name: meta.owner_name ?? '' })}</div>;
  }

  async function setVisibility(v: 'private' | 'org') {
    await apiFetch(`/api/v1/chats/${chatId}`, { method: 'PATCH', body: JSON.stringify({ visibility: v }) });
    patchMeta(chatId, (c) => ({ ...c, visibility: v }));
    await qc.invalidateQueries({ queryKey: ['chats'] });
  }
  async function share(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError(null);
    try {
      await apiFetch(`/api/v1/orgs/${orgId}/counsel-shares`, { method: 'POST', body: JSON.stringify({ resource_type: 'chat', resource_id: chatId, to_user_id: Number(f.get('to')), note: String(f.get('note') ?? '') }) });
      setDone(true);
      setOpen(false);
    } catch { setError(t('shareError')); }
  }
  const counsel = org?.counsel ?? [];
  const seg = (active: boolean) => `flex h-8 items-center gap-1.5 rounded-md px-3 text-sm ${active ? 'bg-surface font-semibold shadow-sm' : 'text-muted hover:text-text'}`;
  return (
    <div className="flex flex-col gap-2 border-b border-border bg-surface px-4 py-2">
      <div className="flex flex-wrap items-center gap-3">
        {orgId && (
          <>
            <div role="radiogroup" aria-label={t('visibility')} className="flex gap-0.5 rounded-lg bg-surface-2 p-0.5">
              <button type="button" role="radio" aria-checked={meta.chat.visibility === 'private'} onClick={() => void setVisibility('private')} className={seg(meta.chat.visibility === 'private')}><Lock className="size-3.5" aria-hidden="true" />{t('private')}</button>
              <button type="button" role="radio" aria-checked={meta.chat.visibility === 'org'} onClick={() => void setVisibility('org')} className={seg(meta.chat.visibility === 'org')}><Users className="size-3.5" aria-hidden="true" />{t('org')}</button>
            </div>
            <span className="text-xs text-muted">{meta.chat.visibility === 'private' ? t('privateHint') : t('orgHint')}</span>
          </>
        )}
        <span className="flex-1" />
        {orgId && (counsel.length > 0
          ? <button type="button" onClick={() => { setOpen((v) => !v); setDone(false); }} className={secondaryBtn}><Send className="size-4" aria-hidden="true" />{t('sendToCounsel')}</button>
          : org && <span className="text-xs text-muted">{t('noCounsel')}</span>)}
        {!orgId && !user.isGuest && <button type="button" onClick={() => setSharing(true)} className={secondaryBtn}><Link2 className="size-4" aria-hidden="true" />{tc('share.button')}</button>}
        <a href={`/print/${chatId}?auto=1`} target="_blank" rel="noopener" className={secondaryBtn}><Printer className="size-4" aria-hidden="true" />{tc('print')}</a>
      </div>
      {done && <p role="status" className={noticeClass}>{t('shared')}</p>}
      {open && (
        <form onSubmit={share} className="flex flex-col gap-2 rounded-xl border border-border p-3">
          <label className="flex flex-col gap-1 text-sm font-medium">{t('to')}
            <select name="to" required defaultValue={counsel[0]?.user_id} className="h-10 rounded-lg border border-border-strong bg-surface px-2">{counsel.map((c) => <option key={c.user_id} value={c.user_id}>{c.name}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">{t('note')}<textarea name="note" rows={3} maxLength={2000} className="rounded-lg border border-border-strong bg-surface p-2 text-sm font-normal" /></label>
          <p className="text-xs text-muted">{t('shareHint')}</p>
          {error && <p role="alert" className={errorClass}>{error}</p>}
          <div className="flex gap-2"><button type="submit" className={primaryBtn}>{t('send')}</button><button type="button" className={secondaryBtn} onClick={() => setOpen(false)}>{t('cancel')}</button></div>
        </form>
      )}
      {sharing && <ShareDialog chatId={chatId} onClose={() => setSharing(false)} />}
    </div>
  );
}
