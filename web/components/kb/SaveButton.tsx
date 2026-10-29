'use client';
import { useMutation } from '@tanstack/react-query';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { apiFetch } from '@/lib/client/api';

/** Save to / remove from "Saved" (FR-KB-014); shown to members only. */
export function SaveButton({ type, id, title, saved: initial }: { type: string; id: string; title: string; saved: boolean }) {
  const t = useTranslations('kb');
  const [saved, setSaved] = useState(initial);
  const toggle = useMutation({
    mutationFn: async (next: boolean) => {
      if (next) await apiFetch('/api/v1/bookmarks', { method: 'POST', body: JSON.stringify({ item_type: type, item_id: id, title }) });
      else await apiFetch(`/api/v1/bookmarks?item_type=${type}&item_id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      return next;
    },
    onSuccess: setSaved,
  });
  const Icon = saved ? BookmarkCheck : Bookmark;
  return (
    <button type="button" aria-pressed={saved} disabled={toggle.isPending} onClick={() => toggle.mutate(!saved)}
      className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-border px-4 text-sm hover:bg-surface-2 disabled:opacity-60">
      <Icon className={`size-4 ${saved ? 'text-primary-700' : ''}`} aria-hidden="true" />{saved ? t('saved') : t('save')}
    </button>
  );
}
